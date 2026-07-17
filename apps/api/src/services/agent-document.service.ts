import { config } from '@repo/config';
import type { Agent, AgentDocument, AgentDocumentStatus } from '@repo/database';
import {
  createAgentDocuments,
  deleteAgentDocumentById,
  getAgentById,
  getAgentDocumentByIdAndAgentId,
  getAgentDocumentsByAgentId,
  updateAgentDocument,
} from '@repo/database';
import { logger } from '@repo/logger';
import { EXTRACT_AGENT_DOCUMENT_JOB, ExtractAgentDocumentJobDto, queue } from '@repo/queue';
import {
  deleteObjects,
  MIME_TYPE_BY_KIND,
  sniffAgentDocumentKind,
  uploadObjectBuffer,
  type SupportedDocumentKind,
} from '@repo/storage';
import { createPrimaryId, tryCatch } from '@repo/utils';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';

const MAX_AGENT_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_AGENT_DOCUMENTS_PER_AGENT = 10;

type AgentDocumentValidation =
  | { kind: SupportedDocumentKind; mimeType: string }
  | { error: string };

/**
 * Validates one uploaded file: size, non-empty, and type by content
 * sniffing (never the client-sent `file.type`). Mirrors the checks in
 * docs/agent-context-documents.md's Pipeline section:
 *   - `%PDF` magic bytes for pdf,
 *   - ZIP magic (`PK`) plus a `.docx` extension for docx (a bare ZIP magic
 *     also matches xlsx/pptx/plain zips, so the extension disambiguates),
 *   - valid UTF-8 for txt/md, disambiguated from each other by extension
 *     since content alone can't tell them apart.
 */
function validateAgentDocumentFile({
  filename,
  fileSize,
  buffer,
}: {
  filename: string;
  fileSize: number;
  buffer: Buffer;
}): AgentDocumentValidation {
  if (fileSize === 0) {
    return { error: `"${filename}" is empty` };
  }

  if (fileSize > MAX_AGENT_DOCUMENT_FILE_BYTES) {
    return { error: `"${filename}" is larger than 10 MB` };
  }

  const kind = sniffAgentDocumentKind(buffer, filename);

  if (!kind) {
    return { error: `"${filename}" is not a supported file type (pdf, docx, txt, md)` };
  }

  return { kind, mimeType: MIME_TYPE_BY_KIND[kind] };
}

/**
 * Uploads one document's bytes to R2 under a fresh key, per the layout in
 * docs/agent-context-documents.md: `agents/{agentId}/{documentId}/{uploadId}`.
 * A replace calls this again with the same `documentId` but gets a new
 * `uploadId`, so the old object is never overwritten in place.
 */
async function uploadAgentDocumentFile({
  agentId,
  documentId,
  buffer,
  contentType,
}: {
  agentId: string;
  documentId: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const key = `agents/${agentId}/${documentId}/${randomUUID()}`;

  await uploadObjectBuffer({
    bucketName: config.cfDocumentsBucketName,
    key,
    buffer,
    contentType,
  });

  return key;
}

/**
 * Deletes R2 objects for agent documents. Best-effort: a failed delete is
 * logged, not thrown, so a stray object never blocks the delete/replace
 * action that triggered it (mirrors `deleteUploadedMediaObjects`).
 */
async function deleteAgentDocumentObjects(storageKeys: string[]): Promise<void> {
  if (storageKeys.length === 0) {
    return;
  }

  const { error, data } = await tryCatch(() =>
    deleteObjects(config.cfDocumentsBucketName, storageKeys),
  );

  if (error !== null) {
    logger.error('Failed to delete agent document objects from R2', { error, storageKeys });
    return;
  }

  if (data && data.errors.length > 0) {
    logger.error('Failed to delete some agent document objects from R2', {
      keys: data.errors,
    });
  }
}

/**
 * Deletes the R2 objects for every document belonging to an agent. Called
 * by agent.controller.ts's DELETE route right before the agent row (and
 * its document rows, via cascade) is removed, since the cascade only
 * cleans up the database side.
 */
export async function deleteAgentDocumentsForAgent({
  agentId,
}: {
  agentId: string;
}): Promise<void> {
  const { data: documents } = await tryCatch(() => getAgentDocumentsByAgentId({ agentId }));

  if (documents && documents.length > 0) {
    await deleteAgentDocumentObjects(documents.map((document) => document.storageKey));
  }
}

/** Loads an agent, throwing the appropriate HTTP exception if it doesn't
 * exist or doesn't belong to `userId`. Shared by every function below that
 * needs an ownership check before touching a document. */
async function loadOwnedAgent({
  agentId,
  userId,
}: {
  agentId: string;
  userId: string;
}): Promise<Agent> {
  const { error, data: agent } = await tryCatch(() => getAgentById({ agentId, userId }));

  if (error !== null) {
    logger.error('Failed to load agent', error);
    throw new InternalServerErrorException('Failed to load agent');
  }

  if (!agent) {
    throw new NotFoundException('Agent not found');
  }

  return agent;
}

/** Loads a document scoped to its owning agent, throwing if it doesn't
 * exist. Callers must already have resolved the agent via
 * `loadOwnedAgent()` first. */
async function loadOwnedDocument({
  agentId,
  documentId,
}: {
  agentId: string;
  documentId: string;
}): Promise<AgentDocument> {
  const { error, data: document } = await tryCatch(() =>
    getAgentDocumentByIdAndAgentId({ id: documentId, agentId }),
  );

  if (error !== null) {
    logger.error('Failed to load agent document', error);
    throw new InternalServerErrorException('Failed to load document');
  }

  if (!document) {
    throw new NotFoundException('Document not found');
  }

  return document;
}

/**
 * Enqueues extraction for one document. Best-effort: a queueing failure
 * (e.g. Redis is down) marks the document 'failed' with a clear message
 * instead of leaving it stuck 'pending' forever with no job behind it. The
 * user can retry once queueing recovers.
 */
async function enqueueAgentDocumentExtraction({
  documentId,
  agentId,
}: {
  documentId: string;
  agentId: string;
}): Promise<void> {
  const { error } = await tryCatch(() =>
    queue
      .agentDocument()
      .add(EXTRACT_AGENT_DOCUMENT_JOB, new ExtractAgentDocumentJobDto({ documentId }).toJSON()),
  );

  if (error === null) {
    return;
  }

  logger.error(`Failed to enqueue extraction for agent document ${documentId}`, error);

  await tryCatch(() =>
    updateAgentDocument({
      id: documentId,
      agentId,
      status: 'failed',
      errorMessage: 'Failed to enqueue extraction',
    }),
  );
}

export interface AgentDocumentResponse {
  id: string;
  name: string;
  mimeType: string;
  fileSize: number;
  status: AgentDocumentStatus;
  isTruncated: boolean;
  errorMessage: string | null;
  updatedAt: Date;
}

// Never includes `extractedText` (can be up to 100k chars, see the PRD's
// limits table) or `storageKey` (an internal R2 detail): no route in the Web
// UI needs either.
function toDocumentResponse(document: AgentDocument): AgentDocumentResponse {
  return {
    id: document.id,
    name: document.name,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    status: document.status,
    isTruncated: document.isTruncated,
    errorMessage: document.errorMessage,
    updatedAt: document.updatedAt,
  };
}

/**
 * [GET] /agent/:agentId/documents
 * List an agent's documents, oldest first. Never returns extractedText.
 */
export async function listAgentDocuments({
  agentId,
  userId,
}: {
  agentId: string;
  userId: string;
}): Promise<AgentDocumentResponse[]> {
  const agent = await loadOwnedAgent({ agentId, userId });

  const { error, data: documents } = await tryCatch(() =>
    getAgentDocumentsByAgentId({ agentId: agent.id }),
  );

  if (error !== null || !documents) {
    logger.error('Failed to list agent documents', error);
    throw new InternalServerErrorException('Failed to list documents');
  }

  return documents.map(toDocumentResponse);
}

/**
 * [POST] /agent/:agentId/documents
 * Uploads one or more files. Validation is all-or-nothing: the first
 * invalid file rejects the whole batch with a 400 naming it, and nothing is
 * stored. Valid files are then uploaded to R2, inserted as 'pending' rows,
 * and queued for extraction.
 */
export async function uploadAgentDocuments({
  agentId,
  userId,
  files,
}: {
  agentId: string;
  userId: string;
  files: File[];
}): Promise<AgentDocumentResponse[]> {
  const agent = await loadOwnedAgent({ agentId, userId });

  if (files.length === 0) {
    throw new BadRequestException('At least one file is required');
  }

  const { error: listError, data: existingDocuments } = await tryCatch(() =>
    getAgentDocumentsByAgentId({ agentId: agent.id }),
  );

  if (listError !== null || !existingDocuments) {
    logger.error('Failed to load existing agent documents', listError);
    throw new InternalServerErrorException('Failed to load existing documents');
  }

  if (existingDocuments.length + files.length > MAX_AGENT_DOCUMENTS_PER_AGENT) {
    throw new BadRequestException(
      `An agent can have at most ${MAX_AGENT_DOCUMENTS_PER_AGENT} documents`,
    );
  }

  // Validate every file before touching R2 or the database: the first
  // failure rejects the whole batch and nothing has been stored yet.
  const validatedFiles: { file: File; buffer: Buffer; mimeType: string }[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateAgentDocumentFile({
      filename: file.name,
      fileSize: file.size,
      buffer,
    });

    if ('error' in validation) {
      throw new BadRequestException(validation.error);
    }

    validatedFiles.push({ file, buffer, mimeType: validation.mimeType });
  }

  const { error: uploadError, data: uploads } = await tryCatch(() =>
    Promise.all(
      validatedFiles.map(async ({ file, buffer, mimeType }) => {
        const documentId = createPrimaryId();
        const storageKey = await uploadAgentDocumentFile({
          agentId: agent.id,
          documentId,
          buffer,
          contentType: mimeType,
        });

        return { documentId, storageKey, name: file.name, mimeType, fileSize: file.size };
      }),
    ),
  );

  if (uploadError !== null || !uploads) {
    logger.error('Failed to upload agent documents to R2', uploadError);
    throw new InternalServerErrorException('Failed to upload documents');
  }

  const { error: createError, data: createdDocuments } = await tryCatch(() =>
    createAgentDocuments(
      uploads.map((upload) => ({
        id: upload.documentId,
        agentId: agent.id,
        name: upload.name,
        storageKey: upload.storageKey,
        mimeType: upload.mimeType,
        fileSize: upload.fileSize,
        status: 'pending' as const,
      })),
    ),
  );

  if (createError !== null || !createdDocuments) {
    logger.error('Failed to save agent documents', createError);
    throw new InternalServerErrorException('Failed to save documents');
  }

  for (const document of createdDocuments) {
    await enqueueAgentDocumentExtraction({ documentId: document.id, agentId: agent.id });
  }

  return createdDocuments.map(toDocumentResponse);
}

/**
 * [PUT] /agent/:agentId/documents/:documentId/file
 * Replaces a document's file: uploads to a new key, points the row at it
 * and back to 'pending', then deletes the old object (best effort) and
 * re-queues extraction. `name` is untouched, only the underlying file
 * changes.
 */
export async function replaceAgentDocumentFile({
  agentId,
  userId,
  documentId,
  file,
}: {
  agentId: string;
  userId: string;
  documentId: string;
  file: File;
}): Promise<AgentDocumentResponse> {
  const agent = await loadOwnedAgent({ agentId, userId });
  const document = await loadOwnedDocument({ agentId: agent.id, documentId });

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateAgentDocumentFile({
    filename: file.name,
    fileSize: file.size,
    buffer,
  });

  if ('error' in validation) {
    throw new BadRequestException(validation.error);
  }

  const { error: uploadError, data: storageKey } = await tryCatch(() =>
    uploadAgentDocumentFile({
      agentId: agent.id,
      documentId: document.id,
      buffer,
      contentType: validation.mimeType,
    }),
  );

  if (uploadError !== null || !storageKey) {
    logger.error('Failed to upload replacement agent document to R2', uploadError);
    throw new InternalServerErrorException('Failed to upload document');
  }

  const { error: updateError, data: updated } = await tryCatch(() =>
    updateAgentDocument({
      id: document.id,
      agentId: agent.id,
      storageKey,
      mimeType: validation.mimeType,
      fileSize: file.size,
      status: 'pending',
    }),
  );

  if (updateError !== null || !updated) {
    logger.error('Failed to save replaced agent document', updateError);
    throw new InternalServerErrorException('Failed to replace document');
  }

  // Only delete the previous object once the row safely points at the new
  // one, and only that one key: other documents are untouched.
  await deleteAgentDocumentObjects([document.storageKey]);

  await enqueueAgentDocumentExtraction({ documentId: document.id, agentId: agent.id });

  return toDocumentResponse(updated);
}

/**
 * [PATCH] /agent/:agentId/documents/:documentId
 * Renames a document. Does not touch the underlying file.
 */
export async function renameAgentDocument({
  agentId,
  userId,
  documentId,
  name,
}: {
  agentId: string;
  userId: string;
  documentId: string;
  name: string;
}): Promise<AgentDocumentResponse> {
  const agent = await loadOwnedAgent({ agentId, userId });
  // Only used for its ownership check: the update below is already scoped
  // to `agentId`, so nothing else from this row is needed.
  await loadOwnedDocument({ agentId: agent.id, documentId });

  const { error, data: updated } = await tryCatch(() =>
    updateAgentDocument({ id: documentId, agentId: agent.id, name }),
  );

  if (error !== null || !updated) {
    logger.error('Failed to rename agent document', error);
    throw new InternalServerErrorException('Failed to rename document');
  }

  return toDocumentResponse(updated);
}

/**
 * [POST] /agent/:agentId/documents/:documentId/retry
 * Re-enqueues extraction for a failed document, without re-uploading.
 * Covers transient worker errors and budget failures after the user
 * removed or shrank other documents.
 */
export async function retryAgentDocument({
  agentId,
  userId,
  documentId,
}: {
  agentId: string;
  userId: string;
  documentId: string;
}): Promise<AgentDocumentResponse> {
  const agent = await loadOwnedAgent({ agentId, userId });
  const document = await loadOwnedDocument({ agentId: agent.id, documentId });

  if (document.status !== 'failed') {
    throw new BadRequestException('Only a failed document can be retried');
  }

  const { error, data: updated } = await tryCatch(() =>
    updateAgentDocument({
      id: document.id,
      agentId: agent.id,
      status: 'pending',
      errorMessage: null,
    }),
  );

  if (error !== null || !updated) {
    logger.error('Failed to reset agent document for retry', error);
    throw new InternalServerErrorException('Failed to retry document');
  }

  await enqueueAgentDocumentExtraction({ documentId: document.id, agentId: agent.id });

  return toDocumentResponse(updated);
}

/**
 * [DELETE] /agent/:agentId/documents/:documentId
 * Removes the row and its R2 object (best effort).
 */
export async function deleteAgentDocument({
  agentId,
  userId,
  documentId,
}: {
  agentId: string;
  userId: string;
  documentId: string;
}): Promise<void> {
  const agent = await loadOwnedAgent({ agentId, userId });
  const document = await loadOwnedDocument({ agentId: agent.id, documentId });

  await deleteAgentDocumentObjects([document.storageKey]);
  await deleteAgentDocumentById({ id: document.id, agentId: agent.id });
}
