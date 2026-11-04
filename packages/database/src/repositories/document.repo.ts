import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Document, Folder, NewDocument } from '../schema';
import { document } from '../schema';

export type { Document, NewDocument } from '../schema';

// Author names are resolved through relations, not a denormalized column:
// whichever of createdByUser/createdByAgent is
// non-null identifies the author.
export type DocumentWithRelations = Document & {
  folder: Folder | null;
  createdByUser: { id: string; name: string } | null;
  createdByAgent: { id: string; name: string } | null;
};

const documentAuthorColumns = { columns: { id: true, name: true } } as const;

export async function getDocumentCountByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  return db.$count(document, eq(document.workspaceId, workspaceId));
}

export type DocumentFolderFilter =
  | { kind: 'all' }
  | { kind: 'unfiled' }
  | { kind: 'folder'; folderId: string };

interface DocumentListFilterInput {
  workspaceId: string;
  folderFilter: DocumentFolderFilter;
}

function toDocumentListFilter({ workspaceId, folderFilter }: DocumentListFilterInput) {
  if (folderFilter.kind === 'all') {
    return { workspaceId };
  }
  if (folderFilter.kind === 'unfiled') {
    // Drizzle's filter type needs the literal `true`, not `boolean`.
    return { workspaceId, folderId: { isNull: true as const } };
  }
  return { workspaceId, folderId: folderFilter.folderId };
}

/**
 * Workspace-scoped list, most recently updated first, with each document's
 * folder and author attached so the web UI can group/label without extra
 * round trips. `folderFilter` narrows it to all documents, those in no
 * folder, or those in one folder.
 */
export async function getDocumentsByWorkspaceId({
  workspaceId,
  folderFilter,
}: DocumentListFilterInput): Promise<DocumentWithRelations[]> {
  return db.query.document.findMany({
    where: toDocumentListFilter({ workspaceId, folderFilter }),
    with: {
      folder: true,
      createdByUser: documentAuthorColumns,
      createdByAgent: documentAuthorColumns,
    },
    orderBy: (t, { desc }) => desc(t.updatedAt),
  });
}

export async function getDocumentById({
  documentId,
  workspaceId,
}: {
  documentId: string;
  workspaceId: string;
}): Promise<DocumentWithRelations | null> {
  const found = await db.query.document.findFirst({
    where: { id: documentId, workspaceId },
    with: {
      folder: true,
      createdByUser: documentAuthorColumns,
      createdByAgent: documentAuthorColumns,
    },
  });

  return found ?? null;
}

export async function createDocument({
  workspaceId,
  folderId,
  title,
  content,
  createdByUserId,
  createdByAgentId,
}: {
  workspaceId: string;
  folderId?: string | null;
  title: string;
  content?: string;
  createdByUserId?: string | null;
  createdByAgentId?: string | null;
}): Promise<Document> {
  const [createdDocument] = await db
    .insert(document)
    .values({ workspaceId, folderId, title, content, createdByUserId, createdByAgentId })
    .returning();

  if (!createdDocument) {
    throw new Error('Failed to create document');
  }

  return createdDocument;
}

type UpdateDocumentFields = Partial<Pick<NewDocument, 'title' | 'content' | 'folderId'>>;

// Last-writer-wins update (also the autosave endpoint):
// no version check, whichever call lands last is what's stored.
export async function updateDocument({
  documentId,
  workspaceId,
  ...fields
}: { documentId: string; workspaceId: string } & UpdateDocumentFields): Promise<Document | null> {
  const [updated] = await db
    .update(document)
    .set(fields)
    .where(and(eq(document.id, documentId), eq(document.workspaceId, workspaceId)))
    .returning();

  return updated ?? null;
}

export async function deleteDocumentById({
  documentId,
  workspaceId,
}: {
  documentId: string;
  workspaceId: string;
}): Promise<boolean> {
  const deleted = await db
    .delete(document)
    .where(and(eq(document.id, documentId), eq(document.workspaceId, workspaceId)))
    .returning({ id: document.id });
  return deleted.length > 0;
}
