import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Folder } from '../schema';
import { document, folder } from '../schema';

export type { Folder, NewFolder } from '../schema';

export async function getFoldersByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Folder[]> {
  return db.query.folder.findMany({
    where: { workspaceId },
    orderBy: (t, { asc }) => asc(t.name),
  });
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
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(document)
      .set({ folderId: null })
      .where(and(eq(document.folderId, folderId), eq(document.workspaceId, workspaceId)));
    await tx
      .delete(folder)
      .where(and(eq(folder.id, folderId), eq(folder.workspaceId, workspaceId)));
  });
}
