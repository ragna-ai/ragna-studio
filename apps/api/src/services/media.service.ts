import { config } from '@repo/config';
import type { ChatAttachment, Media } from '@repo/database';
import {
  countChatAttachmentReferences,
  createChatAttachment,
  createMedia,
  deleteChatAttachmentById,
  deleteMediaById,
  getChatAttachmentById,
  getChatByIdForWorkspace,
  getMediaById,
  getMediaByWorkspaceId,
} from '@repo/database';
import { logger } from '@repo/logger';
import {
  buildChatUploadImageUrls,
  deleteObjects,
  downloadObjectBuffer,
  extractDocumentTextFromBuffer,
  getChatUploadImageKey,
  getMediaDocumentKey,
  sniffChatMediaKind,
  uploadObjectBuffer,
  type ChatMediaKind,
  type SniffedChatMedia,
} from '@repo/storage';
import { createPrimaryId, tryCatch } from '@repo/utils';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';

// MEDIA CORE (docs/media-library/prd.md)
//
// Owns upload validation (content sniffing, never client mime), storage,
// URL building, and refcounted deletion for the media table. @repo/storage
// stays the dumb byte layer; every rule about buckets, keys, and when an
// object may be deleted lives here.

const MAX_CHAT_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const EXTRACTED_TEXT_CHAR_CAP = 50_000;
const TRUNCATION_MARKER = '\n[truncated]';

const IMAGE_CHAT_MEDIA_KINDS: ReadonlySet<ChatMediaKind> = new Set(['png', 'jpeg', 'webp']);
// Extracted to text at upload (tier 2, PRD decision 6). pdf is handled
// separately: it goes to the model as inlined bytes at send time
// (chat.service.ts), never as extracted text.
const TEXT_EXTRACTABLE_CHAT_MEDIA_KINDS: ReadonlySet<ChatMediaKind> = new Set([
  'docx',
  'xlsx',
  'csv',
  'txt',
  'md',
]);

// UPLOAD

type ChatAttachmentValidation = SniffedChatMedia | { error: string };

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

  if (fileSize > MAX_CHAT_ATTACHMENT_FILE_BYTES) {
    return { error: `"${filename}" is larger than 10 MB` };
  }

  const sniffed = sniffChatMediaKind(buffer, filename);

  if (!sniffed) {
    return {
      error: `"${filename}" is not a supported file type (png, jpeg, webp, pdf, docx, xlsx, csv, txt, md)`,
    };
  }

  return sniffed;
}

interface ValidatedChatAttachmentFile {
  file: File;
  buffer: Buffer;
  sniffed: SniffedChatMedia;
}

function capExtractedText(text: string): string {
  return text.length > EXTRACTED_TEXT_CHAR_CAP
    ? `${text.slice(0, EXTRACTED_TEXT_CHAR_CAP)}${TRUNCATION_MARKER}`
    : text;
}

interface StoredChatAttachmentFile {
  mediaId: string;
  bucket: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: ChatMediaKind;
  extractedText: string | null;
}

/**
 * Uploads one validated file to the right bucket/key for its kind (PRD
 * decision 3: images to the public images bucket, everything else to the
 * private documents bucket) and, for tier-2 kinds, extracts and caps its
 * text (decision 6). The mediaId is minted here, before the DB row exists,
 * since the storage key is media-scoped.
 */
async function storeAndExtractChatAttachmentFile({
  ownerId,
  file,
  buffer,
  sniffed,
}: {
  ownerId: string;
  file: File;
  buffer: Buffer;
  sniffed: SniffedChatMedia;
}): Promise<StoredChatAttachmentFile> {
  const mediaId = createPrimaryId();
  const isImage = IMAGE_CHAT_MEDIA_KINDS.has(sniffed.kind);
  const bucket = isImage ? config.cfImagesBucketName : config.cfDocumentsBucketName;
  const storageKey = isImage
    ? getChatUploadImageKey({ ownerId, mediaId })
    : getMediaDocumentKey({ ownerId, mediaId });

  await uploadObjectBuffer({ bucketName: bucket, key: storageKey, buffer, contentType: sniffed.mimeType });

  const extractedText = TEXT_EXTRACTABLE_CHAT_MEDIA_KINDS.has(sniffed.kind)
    ? capExtractedText(await extractDocumentTextFromBuffer({ buffer, mimeType: sniffed.mimeType }))
    : null;

  return {
    mediaId,
    bucket,
    storageKey,
    filename: file.name,
    mimeType: sniffed.mimeType,
    size: file.size,
    kind: sniffed.kind,
    extractedText,
  };
}

function buildChatAttachmentUrl({
  workspaceId,
  mediaId,
  kind,
}: {
  workspaceId: string;
  mediaId: string;
  kind: ChatMediaKind;
}): string {
  if (IMAGE_CHAT_MEDIA_KINDS.has(kind)) {
    return buildChatUploadImageUrls({ ownerId: workspaceId, mediaId }).imgUrl;
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
  kind: ChatMediaKind;
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

/** Loads a chat scoped to its workspace, throwing if it doesn't exist there.
 * Mirrors chat.service.ts's `getChatForWorkspace` ownership check; kept
 * local since importing chat.service.ts here would create a circular
 * dependency (chat.service.ts calls into this file for attachment cleanup
 * and model-message resolution). */
async function loadOwnedChat({
  workspaceId,
  chatId,
}: {
  workspaceId: string;
  chatId: string;
}): Promise<{ id: string }> {
  const { error, data: chatRecord } = await tryCatch(() =>
    getChatByIdForWorkspace({ chatId, workspaceId }),
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
  workspaceId,
  chatId,
  files,
}: {
  workspaceId: string;
  chatId: string;
  files: File[];
}): Promise<UploadChatAttachmentsResponse> {
  await loadOwnedChat({ workspaceId, chatId });

  if (files.length === 0) {
    throw new BadRequestException('At least one file is required');
  }

  // Validate every file before touching R2 or the database: the first
  // failure rejects the whole batch and nothing has been stored yet.
  const validatedFiles: ValidatedChatAttachmentFile[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateChatAttachmentFile({ filename: file.name, fileSize: file.size, buffer });

    if ('error' in validation) {
      throw new BadRequestException(validation.error);
    }

    validatedFiles.push({ file, buffer, sniffed: validation });
  }

  const { error: uploadError, data: stored } = await tryCatch(() =>
    Promise.all(
      validatedFiles.map((validated) =>
        storeAndExtractChatAttachmentFile({ ownerId: workspaceId, ...validated }),
      ),
    ),
  );

  if (uploadError !== null || !stored) {
    logger.error('Failed to upload chat attachments to R2', uploadError);
    throw new InternalServerErrorException('Failed to upload attachments');
  }

  const { error: createError, data: created } = await tryCatch(() =>
    Promise.all(
      stored.map(async (item) => {
        const mediaRow = await createMedia({
          id: item.mediaId,
          ownerWorkspaceId: workspaceId,
          bucket: item.bucket,
          storageKey: item.storageKey,
          filename: item.filename,
          mimeType: item.mimeType,
          size: item.size,
          origin: 'uploaded',
          extractedText: item.extractedText,
        });

        const attachmentRow = await createChatAttachment({ chatId, mediaId: mediaRow.id });

        return { kind: item.kind, mediaRow, attachmentRow };
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

// DELETION (docs/media-library/prd.md, decision 2)

async function deleteMediaObjects(objects: { bucket: string; storageKey: string }[]): Promise<void> {
  if (objects.length === 0) {
    return;
  }

  const storageKeysByBucket: Record<string, string[]> = {};
  for (const { bucket, storageKey } of objects) {
    (storageKeysByBucket[bucket] ??= []).push(storageKey);
  }

  for (const bucket of Object.keys(storageKeysByBucket)) {
    const storageKeys = storageKeysByBucket[bucket];
    const { error, data } = await tryCatch(() => deleteObjects(bucket, storageKeys));

    if (error !== null) {
      logger.error('Failed to delete media objects from R2', { error, bucket, storageKeys });
      continue;
    }

    if (data && data.errors.length > 0) {
      logger.error('Failed to delete some media objects from R2', { bucket, keys: data.errors });
    }
  }
}

/**
 * Deletes a media row and its R2 object once nothing references it anymore.
 * The single place every future link table's refcount must be added to
 * (currently just chat_attachment). Called from every detach point: chat
 * delete, remove-attachment, and the worker sweep cron. Best effort on the
 * R2 side, mirroring `deleteAgentContextDocumentObjects`: a stray object is
 * logged, not thrown, so it never blocks the action that triggered it.
 */
export async function deleteMediaIfUnreferenced({ mediaId }: { mediaId: string }): Promise<void> {
  const { error: countError, data: referenceCount } = await tryCatch(() =>
    countChatAttachmentReferences({ mediaId }),
  );

  // referenceCount can legitimately be 0, so the check must be against
  // `=== null`, not falsy, or a genuinely unreferenced media row would be
  // skipped here.
  if (countError !== null || referenceCount === null) {
    logger.error(`Failed to count references for media ${mediaId}`, countError);
    return;
  }

  if (referenceCount > 0) {
    return;
  }

  const { error: mediaError, data: mediaRow } = await tryCatch(() => getMediaById({ id: mediaId }));

  if (mediaError !== null || !mediaRow) {
    logger.error(`Failed to load media ${mediaId} for deletion`, mediaError);
    return;
  }

  await deleteMediaObjects([{ bucket: mediaRow.bucket, storageKey: mediaRow.storageKey }]);
  await deleteMediaById({ id: mediaId });
}

/**
 * [DELETE] /workspace/:workspaceId/chat/:chatId/attachments/:attachmentId
 * Detaches a file from a chat and deletes the underlying media once
 * unreferenced. Verifies the attachment belongs to the chat and the media
 * to the workspace before touching anything.
 */
export async function removeChatAttachment({
  workspaceId,
  chatId,
  attachmentId,
}: {
  workspaceId: string;
  chatId: string;
  attachmentId: string;
}): Promise<void> {
  await loadOwnedChat({ workspaceId, chatId });

  const { error, data: attachment } = await tryCatch(() => getChatAttachmentById({ id: attachmentId }));

  if (error !== null) {
    logger.error(`Failed to load chat attachment ${attachmentId}`, error);
    throw new InternalServerErrorException('Failed to load attachment');
  }

  if (!attachment || attachment.chatId !== chatId || attachment.media.ownerWorkspaceId !== workspaceId) {
    throw new NotFoundException('Attachment not found');
  }

  const { error: deleteError } = await tryCatch(() => deleteChatAttachmentById({ id: attachment.id }));

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
 */
export async function deleteWorkspaceMediaObjects({ workspaceId }: { workspaceId: string }): Promise<void> {
  const { error, data: mediaRows } = await tryCatch(() => getMediaByWorkspaceId({ workspaceId }));

  if (error !== null || !mediaRows) {
    logger.error(`Failed to load media for workspace ${workspaceId}`, error);
    return;
  }

  await deleteMediaObjects(mediaRows.map((row) => ({ bucket: row.bucket, storageKey: row.storageKey })));
}

// DOWNLOAD

/**
 * Loads a media row guarded by workspace ownership, throwing 404 if it
 * doesn't exist or belongs to a different workspace.
 */
export async function getDownloadableMedia({
  workspaceId,
  mediaId,
}: {
  workspaceId: string;
  mediaId: string;
}): Promise<Media> {
  const { error, data: mediaRow } = await tryCatch(() => getMediaById({ id: mediaId }));

  if (error !== null) {
    logger.error(`Failed to load media ${mediaId}`, error);
    throw new InternalServerErrorException('Failed to load media');
  }

  if (!mediaRow || mediaRow.ownerWorkspaceId !== workspaceId) {
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
  workspaceId,
  mediaId,
}: {
  workspaceId: string;
  mediaId: string;
}): Promise<MediaDownloadFile> {
  const mediaRow = await getDownloadableMedia({ workspaceId, mediaId });

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
