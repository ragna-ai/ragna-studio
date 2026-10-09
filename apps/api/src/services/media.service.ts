import type { ChatAttachment, Media } from '@repo/database';
import {
  createChatAttachment,
  deleteChatAttachmentById,
  getChatAttachmentById,
  getChatById,
  getMediaVisibleToUser,
  getMediaVisibleToUserById,
  getMediaByWorkspaceId,
} from '@repo/database';
import { logger } from '@repo/logger';
import {
  toChatUploadImageUrl,
  deleteMediaIfUnreferenced,
  DOCUMENT_KINDS,
  extractText,
  IMAGE_KINDS,
  MIME_TYPE_BY_MEDIA_KIND,
  sniffMediaKind,
  storeMedia,
  type MediaKind,
  type SniffedMedia,
} from '@repo/media';
import { deleteObjects, downloadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import {
  MAX_FILES_PER_UPLOAD_REQUEST,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILE_MB,
} from '../utils/upload-limits';

// MEDIA CORE
//
// Chat-attachment orchestration and HTTP DTO building on top of
// @repo/media, which owns upload validation (content sniffing, never
// client mime), the type registry, extraction, storage placement, and
// refcounted deletion.

const EXTRACTED_TEXT_CHAR_CAP = 50_000;
const TRUNCATION_MARKER = '\n[truncated]';

// Chat accepts every media kind the platform knows (unified-media-prd.md,
// Goals): images inline, documents either extracted to text or (pdf) sent
// to the model as raw bytes at send time.
const CHAT_ATTACHMENT_ACCEPTED_KINDS: readonly MediaKind[] = [...IMAGE_KINDS, ...DOCUMENT_KINDS];

// Extracted to text at upload (tier 2, PRD decision 6). pdf is handled
// separately: it goes to the model as inlined bytes at send time
// (chat.service.ts), never as extracted text. Deriving this from
// DOCUMENT_KINDS (instead of a hand-picked list) means a newly added
// document kind - like pptx - becomes chat-extractable automatically.
const TEXT_EXTRACTABLE_CHAT_MEDIA_KINDS: ReadonlySet<MediaKind> = new Set(
  DOCUMENT_KINDS.filter((kind) => kind !== 'pdf'),
);

// UPLOAD

type ChatAttachmentValidation = SniffedMedia | { error: string };

/**
 * Validates one uploaded chat attachment: size, non-empty, and type by
 * content sniffing (never the client-sent `file.type`), mirroring
 * agent-context-document.service.ts's `validateAgentContextDocumentFile`.
 */
function validateChatAttachmentFile({
  filename,
  fileSize,
  buffer,
}: {
  filename: string;
  fileSize: number;
  buffer: Buffer;
}): ChatAttachmentValidation {
  if (fileSize === 0) {
    return { error: `"${filename}" is empty` };
  }

  if (fileSize > MAX_UPLOAD_FILE_BYTES) {
    return { error: `"${filename}" is larger than ${MAX_UPLOAD_FILE_MB} MB` };
  }

  const sniffed = sniffMediaKind(buffer, filename, { accept: CHAT_ATTACHMENT_ACCEPTED_KINDS });

  if (!sniffed) {
    return {
      error: `"${filename}" is not a supported file type (png, jpeg, webp, pdf, docx, pptx, xlsx, csv, txt, md)`,
    };
  }

  return sniffed;
}

interface ValidatedChatAttachmentFile {
  file: File;
  buffer: Buffer;
  sniffed: SniffedMedia;
}

function capExtractedText(text: string): string {
  return text.length > EXTRACTED_TEXT_CHAR_CAP
    ? `${text.slice(0, EXTRACTED_TEXT_CHAR_CAP)}${TRUNCATION_MARKER}`
    : text;
}

/**
 * Extracts and caps a tier-2 document's text (decision 6). Every other
 * kind (images, and pdf which is inlined at send time instead) skips
 * extraction and stores no text.
 */
async function extractChatAttachmentText({
  buffer,
  kind,
}: {
  buffer: Buffer;
  kind: MediaKind;
}): Promise<string | null> {
  if (!TEXT_EXTRACTABLE_CHAT_MEDIA_KINDS.has(kind)) {
    return null;
  }

  return capExtractedText(await extractText({ buffer, kind }));
}

interface StoredChatAttachmentFile {
  kind: MediaKind;
  mediaRow: Media;
}

/**
 * Extracts (for tier-2 kinds) then stores one validated file via
 * @repo/media's `storeMedia`, which uploads it to the right bucket/key for
 * its kind (PRD decision 3: images to the public images bucket, everything
 * else to the private documents bucket) and creates its media row.
 */
async function storeChatAttachmentFile({
  workspaceId,
  file,
  buffer,
  sniffed,
}: {
  workspaceId: string;
  file: File;
  buffer: Buffer;
  sniffed: SniffedMedia;
}): Promise<StoredChatAttachmentFile> {
  const extractedText = await extractChatAttachmentText({ buffer, kind: sniffed.kind });

  const mediaRow = await storeMedia({
    owner: { workspaceId },
    buffer,
    filename: file.name,
    kind: sniffed.kind,
    origin: 'uploaded',
    extractedText,
  });

  return { kind: sniffed.kind, mediaRow };
}

function buildChatAttachmentUrl({
  workspaceId,
  mediaId,
  kind,
}: {
  workspaceId: string;
  mediaId: string;
  kind: MediaKind;
}): string {
  if (IMAGE_KINDS.includes(kind)) {
    return toChatUploadImageUrl({ ownerId: workspaceId, mediaId });
  }

  // Private documents bucket: no public URL, only the authenticated
  // download route (media.controller.ts).
  return `/workspace/${workspaceId}/media/${mediaId}/download`;
}

export interface ChatAttachmentResponse {
  id: string;
  mediaId: string;
  filename: string;
  mediaType: string;
  size: number;
  url: string;
}

function toChatAttachmentResponse({
  workspaceId,
  kind,
  mediaRow,
  attachmentRow,
}: {
  workspaceId: string;
  kind: MediaKind;
  mediaRow: Media;
  attachmentRow: ChatAttachment;
}): ChatAttachmentResponse {
  return {
    id: attachmentRow.id,
    mediaId: mediaRow.id,
    filename: mediaRow.filename,
    mediaType: mediaRow.mimeType,
    size: mediaRow.size,
    url: buildChatAttachmentUrl({ workspaceId, mediaId: mediaRow.id, kind }),
  };
}

/** Loads a chat scoped to its author and workspace, throwing if it isn't theirs.
 * Mirrors chat.service.ts's `getChatForWorkspace` ownership check; kept
 * local since importing chat.service.ts here would create a circular
 * dependency (chat.service.ts calls into this file for attachment cleanup
 * and model-message resolution). */
async function loadOwnedChat({
  userId,
  workspaceId,
  chatId,
}: {
  userId: string;
  workspaceId: string;
  chatId: string;
}): Promise<{ id: string }> {
  const { error, data: chatRecord } = await tryCatch(() =>
    getChatById({ chatId, userId, workspaceId }),
  );

  if (error !== null) {
    logger.error(`Failed to load chat ${chatId}`, error);
    throw new InternalServerErrorException('Failed to load chat');
  }

  if (!chatRecord) {
    throw new NotFoundException('Chat not found');
  }

  return chatRecord;
}

export interface UploadChatAttachmentsResponse {
  attachments: ChatAttachmentResponse[];
}

/**
 * [POST] /workspace/:workspaceId/chat/:chatId/attachments
 * Validates, stores, and links one or more files to a chat. Validation is
 * all-or-nothing: the first invalid file rejects the whole batch and
 * nothing is stored (mirrors uploadAgentContextDocuments).
 */
export async function uploadChatAttachments({
  userId,
  workspaceId,
  chatId,
  files,
}: {
  userId: string;
  workspaceId: string;
  chatId: string;
  files: File[];
}): Promise<UploadChatAttachmentsResponse> {
  await loadOwnedChat({ userId, workspaceId, chatId });

  if (files.length === 0) {
    throw new BadRequestException('At least one file is required');
  }

  if (files.length > MAX_FILES_PER_UPLOAD_REQUEST) {
    throw new BadRequestException(`At most ${MAX_FILES_PER_UPLOAD_REQUEST} files per request`);
  }

  // Validate every file before touching R2 or the database: the first
  // failure rejects the whole batch and nothing has been stored yet.
  const validatedFiles: ValidatedChatAttachmentFile[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateChatAttachmentFile({
      filename: file.name,
      fileSize: file.size,
      buffer,
    });

    if ('error' in validation) {
      throw new BadRequestException(validation.error);
    }

    validatedFiles.push({ file, buffer, sniffed: validation });
  }

  const { error: uploadError, data: stored } = await tryCatch(() =>
    Promise.all(
      validatedFiles.map((validated) => storeChatAttachmentFile({ workspaceId, ...validated })),
    ),
  );

  if (uploadError !== null || !stored) {
    logger.error('Failed to upload chat attachments to R2', uploadError);
    throw new InternalServerErrorException('Failed to upload attachments');
  }

  const { error: createError, data: created } = await tryCatch(() =>
    Promise.all(
      stored.map(async ({ kind, mediaRow }) => {
        const attachmentRow = await createChatAttachment({ chatId, mediaId: mediaRow.id });
        return { kind, mediaRow, attachmentRow };
      }),
    ),
  );

  if (createError !== null || !created) {
    logger.error('Failed to save chat attachments', createError);
    throw new InternalServerErrorException('Failed to save attachments');
  }

  return {
    attachments: created.map(({ kind, mediaRow, attachmentRow }) =>
      toChatAttachmentResponse({ workspaceId, kind, mediaRow, attachmentRow }),
    ),
  };
}

/**
 * [DELETE] /workspace/:workspaceId/chat/:chatId/attachments/:attachmentId
 * Detaches a file from a chat and deletes the underlying media once
 * unreferenced. Verifies the attachment belongs to the chat and the media
 * to the workspace before touching anything.
 */
export async function removeChatAttachment({
  userId,
  workspaceId,
  chatId,
  attachmentId,
}: {
  userId: string;
  workspaceId: string;
  chatId: string;
  attachmentId: string;
}): Promise<void> {
  await loadOwnedChat({ userId, workspaceId, chatId });

  const { error, data: attachment } = await tryCatch(() =>
    getChatAttachmentById({ id: attachmentId }),
  );

  if (error !== null) {
    logger.error(`Failed to load chat attachment ${attachmentId}`, error);
    throw new InternalServerErrorException('Failed to load attachment');
  }

  if (
    !attachment ||
    attachment.chatId !== chatId ||
    attachment.media.ownerWorkspaceId !== workspaceId
  ) {
    throw new NotFoundException('Attachment not found');
  }

  const { error: deleteError } = await tryCatch(() =>
    deleteChatAttachmentById({ id: attachment.id }),
  );

  if (deleteError !== null) {
    logger.error(`Failed to delete chat attachment ${attachmentId}`, deleteError);
    throw new InternalServerErrorException('Failed to delete attachment');
  }

  await deleteMediaIfUnreferenced({ mediaId: attachment.mediaId });
}

/**
 * Deletes the R2 objects for every media row owned by a workspace. Called by
 * workspace.service.ts's `deleteWorkspaceForUser()` right before the
 * workspace row is deleted: the FK cascade wipes the media rows for free,
 * but never touches R2, so the objects would orphan invisibly otherwise.
 * Unconditional (no refcount check): every owning row is about to be
 * cascade-deleted along with the workspace, so @repo/media's per-row
 * `deleteMediaIfUnreferenced` doesn't fit here.
 */
export async function deleteWorkspaceMediaObjects({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const { error, data: mediaRows } = await tryCatch(() => getMediaByWorkspaceId({ workspaceId }));

  if (error !== null || !mediaRows) {
    logger.error(`Failed to load media for workspace ${workspaceId}`, error);
    return;
  }

  const storageKeysByBucket: Record<string, string[]> = {};
  for (const { bucket, storageKey } of mediaRows) {
    (storageKeysByBucket[bucket] ??= []).push(storageKey);
  }

  for (const bucket of Object.keys(storageKeysByBucket)) {
    const storageKeys = storageKeysByBucket[bucket];
    const { error: deleteError, data } = await tryCatch(() => deleteObjects(bucket, storageKeys));

    if (deleteError !== null) {
      logger.error('Failed to delete media objects from R2', {
        error: deleteError,
        bucket,
        storageKeys,
      });
      continue;
    }

    if (data && data.errors.length > 0) {
      logger.error('Failed to delete some media objects from R2', { bucket, keys: data.errors });
    }
  }
}

// IMAGE INPUT UPLOAD

export interface UploadedImageInputResponse {
  mediaId: string;
  imgUrl: string;
}

/**
 * Stores an image used as generation input (gen-image reference, gen-video
 * frame) as a workspace media row. Type is checked by content sniffing, never
 * the client-sent `file.type`. The row stays unreferenced until a generate
 * call links it, so abandoned uploads fall to the media-sweep cron.
 */
export async function storeWorkspaceImageInput({
  workspaceId,
  file,
}: {
  workspaceId: string;
  file: File;
}): Promise<UploadedImageInputResponse> {
  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    throw new BadRequestException(`Image must be ${MAX_UPLOAD_FILE_MB} MB or smaller`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMediaKind(buffer, file.name, { accept: IMAGE_KINDS });

  if (!sniffed) {
    throw new BadRequestException('Unsupported image type. Use PNG, JPEG, or WEBP.');
  }

  const { error, data: mediaRow } = await tryCatch(() =>
    storeMedia({
      owner: { workspaceId },
      buffer,
      filename: file.name,
      kind: sniffed.kind,
      origin: 'uploaded',
    }),
  );

  if (error !== null || !mediaRow) {
    logger.error('Failed to store image input', error);
    throw new InternalServerErrorException('Failed to upload image');
  }

  return {
    mediaId: mediaRow.id,
    imgUrl: toChatUploadImageUrl({ ownerId: workspaceId, mediaId: mediaRow.id }),
  };
}

// LIST

export interface MediaListItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/**
 * [GET] /workspace/:workspaceId/media
 * Lists every media row owned by the workspace, newest first. Powers the
 * media-library picker in the email compose UI.
 * No pagination: a workspace's media library is modest in
 * size, same reasoning as task.service.ts's listTasksForWorkspace.
 */
export async function listMediaForWorkspace({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}): Promise<MediaListItem[]> {
  const { error, data: mediaRows } = await tryCatch(() =>
    getMediaVisibleToUser({ workspaceId, userId }),
  );

  if (error !== null || !mediaRows) {
    logger.error(`Failed to list media for workspace ${workspaceId}`, error);
    throw new InternalServerErrorException('Failed to list media');
  }

  return mediaRows
    .map((mediaRow) => ({
      id: mediaRow.id,
      filename: mediaRow.filename,
      mimeType: mediaRow.mimeType,
      size: mediaRow.size,
      createdAt: mediaRow.createdAt,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// DOWNLOAD

/**
 * Loads a media row guarded by workspace ownership, throwing 404 if it
 * doesn't exist, belongs to a different workspace, or is only referenced by
 * a colleague's chat attachment.
 */
export async function getDownloadableMedia({
  userId,
  workspaceId,
  mediaId,
}: {
  userId: string;
  workspaceId: string;
  mediaId: string;
}): Promise<Media> {
  const { error, data: mediaRow } = await tryCatch(() =>
    getMediaVisibleToUserById({ id: mediaId, userId }),
  );

  if (error !== null) {
    logger.error(`Failed to load media ${mediaId}`, error);
    throw new InternalServerErrorException('Failed to load media');
  }

  if (!mediaRow || mediaRow.ownerWorkspaceId !== workspaceId) {
    throw new NotFoundException('Media not found');
  }

  return mediaRow;
}

/**
 * Loads a workspace-owned image media row, throwing 404 for a missing row,
 * another workspace's row, or a non-image row. Shared by every endpoint that
 * accepts a client-sent mediaId as image input (gen-image references,
 * gen-video frames).
 */
export async function getOwnedImageMedia({
  userId,
  workspaceId,
  mediaId,
}: {
  userId: string;
  workspaceId: string;
  mediaId: string;
}): Promise<Media> {
  const mediaRow = await getDownloadableMedia({ userId, workspaceId, mediaId });
  const imageMimeTypes = IMAGE_KINDS.map((kind) => MIME_TYPE_BY_MEDIA_KIND[kind]);

  if (!imageMimeTypes.includes(mediaRow.mimeType)) {
    throw new NotFoundException('Media not found');
  }

  return mediaRow;
}

export interface MediaDownloadFile {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}

/**
 * [GET] /workspace/:workspaceId/media/:mediaId/download
 * Downloads a workspace-owned media object's bytes from R2, for the
 * controller to stream back with the right content-type and filename.
 * Covers both buckets: images have a public CDN URL and rarely hit this
 * route, but documents (the private bucket) only have this route.
 */
export async function downloadMedia({
  userId,
  workspaceId,
  mediaId,
}: {
  userId: string;
  workspaceId: string;
  mediaId: string;
}): Promise<MediaDownloadFile> {
  const mediaRow = await getDownloadableMedia({ userId, workspaceId, mediaId });

  const { error, data: object } = await tryCatch(() =>
    downloadObjectBuffer(mediaRow.bucket, mediaRow.storageKey),
  );

  if (error !== null || !object) {
    logger.error(`Failed to download media ${mediaId} from R2`, error);
    throw new InternalServerErrorException('Failed to download media');
  }

  return {
    bytes: object.buffer,
    contentType: mediaRow.mimeType,
    filename: mediaRow.filename,
  };
}
