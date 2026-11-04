import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Folder } from '../schema';
import { document, folder } from '../schema';

export type { Folder, NewFolder } from '../schema';

export interface FolderWithDocumentCount extends Folder {
  documentCount: number;
}

const folderWithCountColumns = {
  id: folder.id,
  workspaceId: folder.workspaceId,
  name: folder.name,
  deletedAt: folder.deletedAt,
  createdAt: folder.createdAt,
  updatedAt: folder.updatedAt,
  documentCount: count(document.id),
};

export async function getFoldersWithCountByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<FolderWithDocumentCount[]> {
  return db
    .select(folderWithCountColumns)
    .from(folder)
    .leftJoin(document, eq(document.folderId, folder.id))
    .where(eq(folder.workspaceId, workspaceId))
    .groupBy(folder.id)
    .orderBy(asc(folder.name));
}

export async function getFolderWithCountById({
  folderId,
  workspaceId,
}: {
  folderId: string;
  workspaceId: string;
}): Promise<FolderWithDocumentCount | null> {
  const [found] = await db
    .select(folderWithCountColumns)
    .from(folder)
    .leftJoin(document, eq(document.folderId, folder.id))
    .where(and(eq(folder.id, folderId), eq(folder.workspaceId, workspaceId)))
    .groupBy(folder.id);

  return found ?? null;
}

export async function createFolder({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}): Promise<Folder> {
  const [createdFolder] = await db.insert(folder).values({ workspaceId, name }).returning();

  if (!createdFolder) {
    throw new Error('Failed to create folder');
  }

  return createdFolder;
}

export async function renameFolder({
  folderId,
  workspaceId,
  name,
}: {
  folderId: string;
  workspaceId: string;
  name: string;
}): Promise<Folder | null> {
  const [updated] = await db
    .update(folder)
    .set({ name })
    .where(and(eq(folder.id, folderId), eq(folder.workspaceId, workspaceId)))
    .returning();

  return updated ?? null;
}

// Documents in this folder are not deleted: `document.folderId` has an
// `onDelete: 'set null'` FK (folder.schema.ts / document.schema.ts), so they
// move to root automatically when the row below is removed.
export async function deleteFolderById({
  folderId,
  workspaceId,
}: {
  folderId: string;
  workspaceId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .update(document)
      .set({ folderId: null })
      .where(and(eq(document.folderId, folderId), eq(document.workspaceId, workspaceId)));
    const deleted = await tx
      .delete(folder)
      .where(and(eq(folder.id, folderId), eq(folder.workspaceId, workspaceId)))
      .returning({ id: folder.id });
    return deleted.length > 0;
  });
}
