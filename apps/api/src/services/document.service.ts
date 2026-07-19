import type { DocumentWithRelations } from '@repo/database';
import {
  createDocument,
  deleteDocumentById,
  getDocumentById,
  getDocumentsByWorkspaceId,
  updateDocument,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { InternalServerErrorException, NotFoundException } from '../exceptions';

export interface DocumentResponse {
  id: string;
  workspaceId: string;
  folderId: string | null;
  folderName: string | null;
  title: string;
  content: string;
  createdByUserId: string | null;
  createdByUserName: string | null;
  createdByAgentId: string | null;
  createdByAgentName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Authorship display name is resolved here via the joined relations, not a
// denormalized column (docs/documents/prd.md): whichever of
// createdByUserId/createdByAgentId is non-null identifies the author.
function toDocumentResponse(documentRecord: DocumentWithRelations): DocumentResponse {
  return {
    id: documentRecord.id,
    workspaceId: documentRecord.workspaceId,
    folderId: documentRecord.folderId,
    folderName: documentRecord.folder?.name ?? null,
    title: documentRecord.title,
    content: documentRecord.content,
    createdByUserId: documentRecord.createdByUserId,
    createdByUserName: documentRecord.createdByUser?.name ?? null,
    createdByAgentId: documentRecord.createdByAgentId,
    createdByAgentName: documentRecord.createdByAgent?.name ?? null,
    createdAt: documentRecord.createdAt,
    updatedAt: documentRecord.updatedAt,
  };
}

/**
 * Loads one document and converts it, throwing 404 if it isn't found.
 * Callers rely on the workspace guard having already verified `workspaceId`
 * belongs to the authenticated user (docs/api-standards/prd.md).
 */
async function loadDocumentResponse({
  workspaceId,
  documentId,
}: {
  workspaceId: string;
  documentId: string;
}): Promise<DocumentResponse> {
  const { error, data: documentRecord } = await tryCatch(() =>
    getDocumentById({ documentId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to load document', error);
    throw new InternalServerErrorException('Failed to load document');
  }

  if (!documentRecord) {
    throw new NotFoundException('Document not found');
  }

  return toDocumentResponse(documentRecord);
}

/**
 * [GET] /workspace/:workspaceId/document
 * Lists a workspace's documents, most recently updated first.
 */
export async function listDocuments({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<DocumentResponse[]> {
  const { error, data: documents } = await tryCatch(() =>
    getDocumentsByWorkspaceId({ workspaceId }),
  );

  if (error !== null || !documents) {
    logger.error('Failed to list documents', error);
    throw new InternalServerErrorException('Failed to list documents');
  }

  return documents.map(toDocumentResponse);
}

/**
 * [GET] /workspace/:workspaceId/document/:documentId
 */
export async function getDocument({
  workspaceId,
  documentId,
}: {
  workspaceId: string;
  documentId: string;
}): Promise<DocumentResponse> {
  return loadDocumentResponse({ workspaceId, documentId });
}

/**
 * [POST] /workspace/:workspaceId/document
 * Human-created: sets createdByUserId, never createdByAgentId.
 */
export async function createDocumentForUser({
  workspaceId,
  userId,
  title,
  content,
  folderId,
}: {
  workspaceId: string;
  userId: string;
  title: string;
  content?: string;
  folderId?: string | null;
}): Promise<DocumentResponse> {
  const { error, data: createdDocument } = await tryCatch(() =>
    createDocument({ workspaceId, folderId, title, content, createdByUserId: userId }),
  );

  if (error !== null || !createdDocument) {
    logger.error('Failed to create document', error);
    throw new InternalServerErrorException('Failed to create document');
  }

  return loadDocumentResponse({ workspaceId, documentId: createdDocument.id });
}

/**
 * [PATCH] /workspace/:workspaceId/document/:documentId
 * Also the autosave endpoint (debounced client-side): last writer wins, no
 * conflict detection in v1 (docs/documents/prd.md).
 */
export async function updateDocumentForUser({
  workspaceId,
  documentId,
  title,
  content,
  folderId,
}: {
  workspaceId: string;
  documentId: string;
  title?: string;
  content?: string;
  folderId?: string | null;
}): Promise<DocumentResponse> {
  const { error, data: updated } = await tryCatch(() =>
    updateDocument({ documentId, workspaceId, title, content, folderId }),
  );

  if (error !== null) {
    logger.error('Failed to update document', error);
    throw new InternalServerErrorException('Failed to update document');
  }

  if (!updated) {
    throw new NotFoundException('Document not found');
  }

  return loadDocumentResponse({ workspaceId, documentId });
}

/**
 * [DELETE] /workspace/:workspaceId/document/:documentId
 */
export async function deleteDocument({
  workspaceId,
  documentId,
}: {
  workspaceId: string;
  documentId: string;
}): Promise<void> {
  await deleteDocumentById({ documentId, workspaceId });
}
