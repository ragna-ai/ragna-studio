import type { DocumentWithRelations } from '@repo/database';
import {
  createDocument,
  deleteDocumentById,
  getDocumentById,
  getDocumentsByWorkspaceId,
  updateDocument,
} from '@repo/database';
import type { DocumentExport } from '@repo/export';
import { toDocumentDocx, toDocumentMarkdown, toDocumentPdf, toDocumentText } from '@repo/export';
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
// denormalized column: whichever of
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
 * belongs to the authenticated user.
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

// EXPORT

export type DocumentExportFormat = 'md' | 'txt' | 'pdf' | 'docx';

export interface DocumentExportFile {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}

const DOCUMENT_EXPORT_WRITERS: Record<
  DocumentExportFormat,
  (input: DocumentExport) => Promise<{ bytes: Uint8Array; contentType: string }>
> = {
  md: toDocumentMarkdown,
  txt: toDocumentText,
  pdf: toDocumentPdf,
  docx: toDocumentDocx,
};

const DOCUMENT_EXPORT_FILE_EXTENSION: Record<DocumentExportFormat, string> = {
  md: 'md',
  txt: 'txt',
  pdf: 'pdf',
  docx: 'docx',
};

// Same slug rule as dataset export (specs/datasets/export-and-row-reorder.md
// "User experience", Export): lowercase, ASCII, hyphen-separated, no leading
// or trailing hyphens. Kept local to this service rather than shared with
// `dataset.service.ts`: datasets and documents deliberately share no access
// logic or mapping code (decision "A generic /export endpoint", rejected).
function slugifyDocumentTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'document';
}

function toDocumentExportFilename(title: string, format: DocumentExportFormat): string {
  const exportDate = new Date().toISOString().slice(0, 10);
  return `${slugifyDocumentTitle(title)}-${exportDate}.${DOCUMENT_EXPORT_FILE_EXTENSION[format]}`;
}

/**
 * [GET] /workspace/:workspaceId/document/:documentId/export
 * `content` is already canonical markdown (documents/prd.md), so the
 * mapping to `DocumentExport` is a straight pass-through; every writer
 * parses it once inside `@repo/export`. An empty document still exports a
 * title-only file.
 */
export async function exportDocument({
  workspaceId,
  documentId,
  format,
}: {
  workspaceId: string;
  documentId: string;
  format: DocumentExportFormat;
}): Promise<DocumentExportFile> {
  const documentRecord = await loadDocumentResponse({ workspaceId, documentId });

  const { bytes, contentType } = await DOCUMENT_EXPORT_WRITERS[format]({
    title: documentRecord.title,
    markdown: documentRecord.content,
  });

  return {
    bytes,
    contentType,
    filename: toDocumentExportFilename(documentRecord.title, format),
  };
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
 * conflict detection in v1.
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
