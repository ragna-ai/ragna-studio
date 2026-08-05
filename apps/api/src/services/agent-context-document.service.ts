import { AGENT_CONTEXT_INJECTION_THRESHOLD } from '@repo/ai';
import { config } from '@repo/config';
import type { Agent, AgentContextDocument, AgentContextDocumentStatus } from '@repo/database';
import {
  createAgentContextDocuments,
  deleteAgentContextDocumentById,
  deleteAgentContextDocumentChunksByDocumentId,
  getAgentByIdAndWorkspaceId,
  getAgentContextDocumentByIdAndAgentId,
  getAgentContextDocumentsByAgentId,
  updateAgentContextDocument,
} from '@repo/database';
import { logger } from '@repo/logger';
import { DOCUMENT_KINDS, MIME_TYPE_BY_MEDIA_KIND, sniffMediaKind, type MediaKind } from '@repo/media';
import { EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB, ExtractAgentContextDocumentJobDto, queue } from '@repo/queue';
import { deleteObjects, uploadObjectBuffer } from '@repo/storage';
import { createPrimaryId, tryCatch } from '@repo/utils';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';

const MAX_AGENT_CONTEXT_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_AGENT_CONTEXT_DOCUMENTS_PER_AGENT = 25;

type AgentContextDocumentValidation = { kind: MediaKind; mimeType: string } | { error: string };

/**
 * Validates one uploaded file: size, non-empty, and type by content
 * sniffing (never the client-sent `file.type`), scoped to every document
 * kind chat attachments accept (unified-media-prd.md decision 2 and 6):
 * pdf, docx, pptx, xlsx, csv, txt, md.
 */
function validateAgentContextDocumentFile({
  filename,
  fileSize,
  buffer,
}: {
  filename: string;
  fileSize: number;
  buffer: Buffer;
}): AgentContextDocumentValidation {
  if (fileSize === 0) {
    return { error: `"${filename}" is empty` };
  }

  if (fileSize > MAX_AGENT_CONTEXT_DOCUMENT_FILE_BYTES) {
    return { error: `"${filename}" is larger than 10 MB` };
  }

  const sniffed = sniffMediaKind(buffer, filename, { accept: DOCUMENT_KINDS });

  if (!sniffed) {
    return {
      error: `"${filename}" is not a supported file type (pdf, docx, pptx, xlsx, csv, txt, md)`,
    };
  }

  return { kind: sniffed.kind, mimeType: MIME_TYPE_BY_MEDIA_KIND[sniffed.kind] };
}

/**
 * Uploads one document's bytes to R2 under a fresh key, per the layout in
 * docs/agent-context-documents.md: `agents/{agentId}/{documentId}/{uploadId}`.
 * A replace calls this again with the same `documentId` but gets a new
 * `uploadId`, so the old object is never overwritten in place.
 */
async function uploadAgentContextDocumentFile({
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
async function deleteAgentContextDocumentObjects(storageKeys: string[]): Promise<void> {
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
 * by agent.service.ts's `deleteAgentForWorkspace()` right before the agent
 * row (and its document rows, via cascade) is removed, since the cascade
 * only cleans up the database side.
 */
export async function deleteAgentContextDocumentsForAgent({
  agentId,
}: {
  agentId: string;
}): Promise<void> {
  const { data: documents } = await tryCatch(() => getAgentContextDocumentsByAgentId({ agentId }));

  if (documents && documents.length > 0) {
    await deleteAgentContextDocumentObjects(documents.map((document) => document.storageKey));
  }
}

/**
 * Deletes a document's chunks. Best-effort, mirroring
 * `deleteAgentContextDocumentObjects`: hygiene only (the ready-join already
 * hides a non-ready document's chunks from search), so a failure here must
 * never block the retry/replace action that triggered it.
 */
async function deleteAgentContextDocumentChunks(documentId: string): Promise<void> {
  const { error } = await tryCatch(() => deleteAgentContextDocumentChunksByDocumentId({ documentId }));

  if (error !== null) {
    logger.error(`Failed to delete chunks for agent document ${documentId}`, error);
  }
}

/** Loads an agent scoped to its workspace, throwing the appropriate HTTP
 * exception if it doesn't exist there. Shared by every function below that
 * needs to resolve the agent before touching a document. Callers rely on
 * the workspace guard having already verified `workspaceId` belongs to the
 * authenticated user (docs/api-standards/prd.md). */
async function loadOwnedAgent({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
}): Promise<Agent> {
  const { error, data: agent } = await tryCatch(() =>
    getAgentByIdAndWorkspaceId({ agentId, workspaceId }),
  );

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
}): Promise<AgentContextDocument> {
  const { error, data: document } = await tryCatch(() =>
    getAgentContextDocumentByIdAndAgentId({ id: documentId, agentId }),
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
async function enqueueAgentContextDocumentExtraction({
  documentId,
  agentId,
}: {
  documentId: string;
  agentId: string;
}): Promise<void> {
  const { error } = await tryCatch(() =>
    queue
      .agentContextDocument()
      .add(EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB, new ExtractAgentContextDocumentJobDto({ documentId }).toJSON()),
  );

  if (error === null) {
    return;
  }

  logger.error(`Failed to enqueue extraction for agent document ${documentId}`, error);

  await tryCatch(() =>
    updateAgentContextDocument({
      id: documentId,
      agentId,
      status: 'failed',
      errorMessage: 'Failed to enqueue extraction',
    }),
  );
}

export interface AgentContextDocumentResponse {
  id: string;
  name: string;
  mimeType: string;
  fileSize: number;
  status: AgentContextDocumentStatus;
  isTruncated: boolean;
  errorMessage: string | null;
  updatedAt: Date;
  charCount: number;
}

// Never includes `extractedText` itself (can be up to 500k chars, see the
// PRD's limits table) or `storageKey` (an internal R2 detail), only its
// length: no route in the Web UI needs the full text, but the panel needs
// the size to show the inject-vs-retrieval mode (docs/agent/
// agent-context-retrieval.md, "Web UI").
function toDocumentResponse(document: AgentContextDocument): AgentContextDocumentResponse {
  return {
    id: document.id,
    name: document.name,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    status: document.status,
    isTruncated: document.isTruncated,
    errorMessage: document.errorMessage,
    updatedAt: document.updatedAt,
    charCount: document.extractedText?.length ?? 0,
  };
}

export interface AgentContextDocumentListSummary {
  totalReadyChars: number;
  injectionThreshold: number;
  mode: 'inject' | 'retrieval';
}

export interface AgentContextDocumentListResponse {
  documents: AgentContextDocumentResponse[];
  summary: AgentContextDocumentListSummary;
}

/**
 * [GET] /workspace/:workspaceId/agent/:agentId/context-document
 * List an agent's documents, oldest first, plus a summary of the total ready
 * text and which prompting mode it puts the agent in (docs/agent/
 * agent-context-retrieval.md, "Prompt injection changes"). Never returns
 * extractedText.
 */
export async function listAgentContextDocuments({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
}): Promise<AgentContextDocumentListResponse> {
  const agent = await loadOwnedAgent({ agentId, workspaceId });

  const { error, data: documents } = await tryCatch(() =>
    getAgentContextDocumentsByAgentId({ agentId: agent.id }),
  );

  if (error !== null || !documents) {
    logger.error('Failed to list agent documents', error);
    throw new InternalServerErrorException('Failed to list documents');
  }

  const totalReadyChars = documents
    .filter((document) => document.status === 'ready')
    .reduce((sum, document) => sum + (document.extractedText?.length ?? 0), 0);

  return {
    documents: documents.map(toDocumentResponse),
    summary: {
      totalReadyChars,
      injectionThreshold: AGENT_CONTEXT_INJECTION_THRESHOLD,
      mode: totalReadyChars > AGENT_CONTEXT_INJECTION_THRESHOLD ? 'retrieval' : 'inject',
    },
  };
}

/**
 * [POST] /workspace/:workspaceId/agent/:agentId/context-document
 * Uploads one or more files. Validation is all-or-nothing: the first
 * invalid file rejects the whole batch with a 400 naming it, and nothing is
 * stored. Valid files are then uploaded to R2, inserted as 'pending' rows,
 * and queued for extraction.
 */
export async function uploadAgentContextDocuments({
  agentId,
  workspaceId,
  files,
}: {
  agentId: string;
  workspaceId: string;
  files: File[];
}): Promise<AgentContextDocumentResponse[]> {
  const agent = await loadOwnedAgent({ agentId, workspaceId });

  if (files.length === 0) {
    throw new BadRequestException('At least one file is required');
  }

  const { error: listError, data: existingDocuments } = await tryCatch(() =>
    getAgentContextDocumentsByAgentId({ agentId: agent.id }),
  );

  if (listError !== null || !existingDocuments) {
    logger.error('Failed to load existing agent documents', listError);
    throw new InternalServerErrorException('Failed to load existing documents');
  }

  if (existingDocuments.length + files.length > MAX_AGENT_CONTEXT_DOCUMENTS_PER_AGENT) {
    throw new BadRequestException(
      `An agent can have at most ${MAX_AGENT_CONTEXT_DOCUMENTS_PER_AGENT} documents`,
    );
  }

  // Validate every file before touching R2 or the database: the first
  // failure rejects the whole batch and nothing has been stored yet.
  const validatedFiles: { file: File; buffer: Buffer; mimeType: string }[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateAgentContextDocumentFile({
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
        const storageKey = await uploadAgentContextDocumentFile({
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
    createAgentContextDocuments(
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
    await enqueueAgentContextDocumentExtraction({ documentId: document.id, agentId: agent.id });
  }

  return createdDocuments.map(toDocumentResponse);
}

/**
 * [PUT] /workspace/:workspaceId/agent/:agentId/context-document/:documentId/file
 * Replaces a document's file: uploads to a new key, points the row at it
 * and back to 'pending', then deletes the old object (best effort) and
 * re-queues extraction. `name` is untouched, only the underlying file
 * changes.
 */
export async function replaceAgentContextDocumentFile({
  agentId,
  workspaceId,
  documentId,
  file,
}: {
  agentId: string;
  workspaceId: string;
  documentId: string;
  file: File;
}): Promise<AgentContextDocumentResponse> {
  const agent = await loadOwnedAgent({ agentId, workspaceId });
  const document = await loadOwnedDocument({ agentId: agent.id, documentId });

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateAgentContextDocumentFile({
    filename: file.name,
    fileSize: file.size,
    buffer,
  });

  if ('error' in validation) {
    throw new BadRequestException(validation.error);
  }

  const { error: uploadError, data: storageKey } = await tryCatch(() =>
    uploadAgentContextDocumentFile({
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
    updateAgentContextDocument({
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

  // Hygiene: the ready-join already hides a pending document's old chunks
  // from search, but this drops them outright instead of leaving them for
  // the next successful extraction's transaction to replace
  // (docs/agent/agent-context-retrieval.md, "Pipeline changes").
  await deleteAgentContextDocumentChunks(document.id);

  // Only delete the previous object once the row safely points at the new
  // one, and only that one key: other documents are untouched.
  await deleteAgentContextDocumentObjects([document.storageKey]);

  await enqueueAgentContextDocumentExtraction({ documentId: document.id, agentId: agent.id });

  return toDocumentResponse(updated);
}

/**
 * [PATCH] /workspace/:workspaceId/agent/:agentId/context-document/:documentId
 * Renames a document. Does not touch the underlying file.
 */
export async function renameAgentContextDocument({
  agentId,
  workspaceId,
  documentId,
  name,
}: {
  agentId: string;
  workspaceId: string;
  documentId: string;
  name: string;
}): Promise<AgentContextDocumentResponse> {
  const agent = await loadOwnedAgent({ agentId, workspaceId });
  // Only used for its ownership check: the update below is already scoped
  // to `agentId`, so nothing else from this row is needed.
  await loadOwnedDocument({ agentId: agent.id, documentId });

  const { error, data: updated } = await tryCatch(() =>
    updateAgentContextDocument({ id: documentId, agentId: agent.id, name }),
  );

  if (error !== null || !updated) {
    logger.error('Failed to rename agent document', error);
    throw new InternalServerErrorException('Failed to rename document');
  }

  return toDocumentResponse(updated);
}

/**
 * [POST] /workspace/:workspaceId/agent/:agentId/context-document/:documentId/retry
 * Re-enqueues extraction for a failed document, without re-uploading.
 * Covers transient worker errors and budget failures after the user
 * removed or shrank other documents.
 */
export async function retryAgentContextDocument({
  agentId,
  workspaceId,
  documentId,
}: {
  agentId: string;
  workspaceId: string;
  documentId: string;
}): Promise<AgentContextDocumentResponse> {
  const agent = await loadOwnedAgent({ agentId, workspaceId });
  const document = await loadOwnedDocument({ agentId: agent.id, documentId });

  if (document.status !== 'failed') {
    throw new BadRequestException('Only a failed document can be retried');
  }

  const { error, data: updated } = await tryCatch(() =>
    updateAgentContextDocument({
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

  await enqueueAgentContextDocumentExtraction({ documentId: document.id, agentId: agent.id });

  return toDocumentResponse(updated);
}

/**
 * [DELETE] /workspace/:workspaceId/agent/:agentId/context-document/:documentId
 * Removes the row and its R2 object (best effort).
 */
export async function deleteAgentContextDocument({
  agentId,
  workspaceId,
  documentId,
}: {
  agentId: string;
  workspaceId: string;
  documentId: string;
}): Promise<void> {
  const agent = await loadOwnedAgent({ agentId, workspaceId });
  const document = await loadOwnedDocument({ agentId: agent.id, documentId });

  await deleteAgentContextDocumentObjects([document.storageKey]);
  await deleteAgentContextDocumentById({ id: document.id, agentId: agent.id });
}
