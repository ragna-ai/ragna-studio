import type { Media, TaskAttachment, TaskWithDetails } from '@repo/database';
import {
  createTaskAttachment,
  deleteTaskAttachmentById,
  getTaskAttachmentById,
  getTaskAttachmentsByTaskId,
  getTaskById,
} from '@repo/database';
import { logger } from '@repo/logger';
import {
  deleteMediaIfUnreferenced,
  DOCUMENT_KINDS,
  IMAGE_KINDS,
  sniffMediaKind,
  storeMedia,
  type MediaKind,
  type SniffedMedia,
} from '@repo/media';
import { tryCatch } from '@repo/utils';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';
import {
  MAX_FILES_PER_UPLOAD_REQUEST,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILE_MB,
} from '../utils/upload-limits';

// TASK ATTACHMENTS
//
// Straight port of media.service.ts's chat-attachment orchestration onto
// tasks. Files only: no text extraction, no agent visibility into contents
// (PRD decision "Scope"), so unlike chat this never calls @repo/media's
// `extractText`.


// Task attachments accept every media kind the platform knows, same as chat
// (specs/tasks/attachments-prd.md doesn't define a narrower set).
const TASK_ATTACHMENT_ACCEPTED_KINDS: readonly MediaKind[] = [...IMAGE_KINDS, ...DOCUMENT_KINDS];

// UPLOAD

type TaskAttachmentValidation = SniffedMedia | { error: string };

/**
 * Validates one uploaded task attachment: size, non-empty, and type by
 * content sniffing (never the client-sent `file.type`), mirroring
 * media.service.ts's `validateChatAttachmentFile`.
 */
function validateTaskAttachmentFile({
  filename,
  fileSize,
  buffer,
}: {
  filename: string;
  fileSize: number;
  buffer: Buffer;
}): TaskAttachmentValidation {
  if (fileSize === 0) {
    return { error: `"${filename}" is empty` };
  }

  if (fileSize > MAX_UPLOAD_FILE_BYTES) {
    return { error: `"${filename}" is larger than ${MAX_UPLOAD_FILE_MB} MB` };
  }

  const sniffed = sniffMediaKind(buffer, filename, { accept: TASK_ATTACHMENT_ACCEPTED_KINDS });

  if (!sniffed) {
    return {
      error: `"${filename}" is not a supported file type (png, jpeg, webp, pdf, docx, pptx, xlsx, csv, txt, md)`,
    };
  }

  return sniffed;
}

interface ValidatedTaskAttachmentFile {
  file: File;
  buffer: Buffer;
  sniffed: SniffedMedia;
}

/**
 * Stores one validated file via @repo/media's `storeMedia`, which uploads it
 * to the right bucket/key for its kind and creates its media row. No
 * extraction: task attachments never populate `extractedText`.
 */
async function storeTaskAttachmentFile({
  workspaceId,
  file,
  buffer,
  sniffed,
}: {
  workspaceId: string;
  file: File;
  buffer: Buffer;
  sniffed: SniffedMedia;
}): Promise<Media> {
  return storeMedia({
    owner: { workspaceId },
    buffer,
    filename: file.name,
    kind: sniffed.kind,
    origin: 'uploaded',
  });
}

function buildTaskAttachmentDownloadUrl({
  workspaceId,
  mediaId,
}: {
  workspaceId: string;
  mediaId: string;
}): string {
  return `/workspace/${workspaceId}/media/${mediaId}/download`;
}

export interface TaskAttachmentResponse {
  id: string;
  mediaId: string;
  filename: string;
  mediaType: string;
  size: number;
  url: string;
}

function toTaskAttachmentResponse({
  workspaceId,
  mediaRow,
  attachmentRow,
}: {
  workspaceId: string;
  mediaRow: Media;
  attachmentRow: TaskAttachment;
}): TaskAttachmentResponse {
  return {
    id: attachmentRow.id,
    mediaId: mediaRow.id,
    filename: mediaRow.filename,
    mediaType: mediaRow.mimeType,
    size: mediaRow.size,
    url: buildTaskAttachmentDownloadUrl({ workspaceId, mediaId: mediaRow.id }),
  };
}

/** Loads a task scoped to its workspace, throwing 404 if it doesn't exist
 * there. Mirrors media.service.ts's `loadOwnedChat`. */
async function loadOwnedTask({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}): Promise<TaskWithDetails> {
  const { error, data: taskRecord } = await tryCatch(() => getTaskById({ id: taskId, workspaceId }));

  if (error !== null) {
    logger.error(`Failed to load task ${taskId}`, error);
    throw new InternalServerErrorException('Failed to load task');
  }

  if (!taskRecord) {
    throw new NotFoundException('Task not found');
  }

  return taskRecord;
}

export interface UploadTaskAttachmentsResponse {
  attachments: TaskAttachmentResponse[];
}

/**
 * [POST] /workspace/:workspaceId/task/:taskId/attachments
 * Validates, stores, and links one or more files to a task. Validation is
 * all-or-nothing: the first invalid file rejects the whole batch and
 * nothing is stored (mirrors uploadChatAttachments).
 */
export async function uploadTaskAttachments({
  workspaceId,
  taskId,
  files,
}: {
  workspaceId: string;
  taskId: string;
  files: File[];
}): Promise<UploadTaskAttachmentsResponse> {
  await loadOwnedTask({ workspaceId, taskId });

  if (files.length === 0) {
    throw new BadRequestException('At least one file is required');
  }

  if (files.length > MAX_FILES_PER_UPLOAD_REQUEST) {
    throw new BadRequestException(`At most ${MAX_FILES_PER_UPLOAD_REQUEST} files per request`);
  }

  // Validate every file before touching R2 or the database: the first
  // failure rejects the whole batch and nothing has been stored yet.
  const validatedFiles: ValidatedTaskAttachmentFile[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateTaskAttachmentFile({
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
      validatedFiles.map((validated) => storeTaskAttachmentFile({ workspaceId, ...validated })),
    ),
  );

  if (uploadError !== null || !stored) {
    logger.error('Failed to upload task attachments to R2', uploadError);
    throw new InternalServerErrorException('Failed to upload attachments');
  }

  const { error: createError, data: created } = await tryCatch(() =>
    Promise.all(
      stored.map(async (mediaRow) => {
        const attachmentRow = await createTaskAttachment({ taskId, mediaId: mediaRow.id });
        return { mediaRow, attachmentRow };
      }),
    ),
  );

  if (createError !== null || !created) {
    logger.error('Failed to save task attachments', createError);
    throw new InternalServerErrorException('Failed to save attachments');
  }

  return {
    attachments: created.map(({ mediaRow, attachmentRow }) =>
      toTaskAttachmentResponse({ workspaceId, mediaRow, attachmentRow }),
    ),
  };
}

/**
 * [GET] /workspace/:workspaceId/task/:taskId/attachments
 * Lists a task's attachments, oldest first (same ordering as
 * getTaskAttachmentsByTaskId).
 */
export async function listTaskAttachments({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}): Promise<UploadTaskAttachmentsResponse> {
  await loadOwnedTask({ workspaceId, taskId });

  const { error, data: attachments } = await tryCatch(() =>
    getTaskAttachmentsByTaskId({ taskId }),
  );

  if (error !== null || !attachments) {
    logger.error(`Failed to list task attachments for task ${taskId}`, error);
    throw new InternalServerErrorException('Failed to list attachments');
  }

  return {
    attachments: attachments.map(({ media: mediaRow, ...attachmentRow }) =>
      toTaskAttachmentResponse({ workspaceId, mediaRow, attachmentRow }),
    ),
  };
}

/**
 * [DELETE] /workspace/:workspaceId/task/:taskId/attachments/:attachmentId
 * Detaches a file from a task and deletes the underlying media once
 * unreferenced. Verifies the attachment belongs to the task and the media
 * to the workspace before touching anything.
 */
export async function removeTaskAttachment({
  workspaceId,
  taskId,
  attachmentId,
}: {
  workspaceId: string;
  taskId: string;
  attachmentId: string;
}): Promise<void> {
  await loadOwnedTask({ workspaceId, taskId });

  const { error, data: attachment } = await tryCatch(() =>
    getTaskAttachmentById({ id: attachmentId }),
  );

  if (error !== null) {
    logger.error(`Failed to load task attachment ${attachmentId}`, error);
    throw new InternalServerErrorException('Failed to load attachment');
  }

  if (
    !attachment ||
    attachment.taskId !== taskId ||
    attachment.media.ownerWorkspaceId !== workspaceId
  ) {
    throw new NotFoundException('Attachment not found');
  }

  const { error: deleteError } = await tryCatch(() =>
    deleteTaskAttachmentById({ id: attachment.id }),
  );

  if (deleteError !== null) {
    logger.error(`Failed to delete task attachment ${attachmentId}`, deleteError);
    throw new InternalServerErrorException('Failed to delete attachment');
  }

  await deleteMediaIfUnreferenced({ mediaId: attachment.mediaId });
}
