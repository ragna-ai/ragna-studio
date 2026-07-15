import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Workspace } from '../schema';
import { workspace } from '../schema';

export async function createWorkspace({
  ownerId,
  name,
}: {
  ownerId: string;
  name: string;
}): Promise<Workspace> {
  const [createdWorkspace] = await db.insert(workspace).values({ ownerId, name }).returning();

  if (!createdWorkspace) {
    throw new Error('Failed to create workspace');
  }

  return createdWorkspace;
}

export async function getAllWorkspacesByOwnerId({
  ownerId,
}: {
  ownerId: string;
}): Promise<Workspace[]> {
  return db.query.workspace.findMany({
    where: { ownerId },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
}

export async function getWorkspaceById({
  id,
  ownerId,
}: {
  id: string;
  ownerId: string;
}): Promise<Workspace | null> {
  const workspaceRecord = await db.query.workspace.findFirst({
    where: { id, ownerId },
  });

  return workspaceRecord ?? null;
}

export async function updateWorkspace({
  id,
  ownerId,
  name,
}: {
  id: string;
  ownerId: string;
  name: string;
}): Promise<Workspace | null> {
  const [updatedWorkspace] = await db
    .update(workspace)
    .set({ name })
    .where(and(eq(workspace.id, id), eq(workspace.ownerId, ownerId)))
    .returning();

  return updatedWorkspace ?? null;
}

// Resources scoped to this workspace fall back to unassigned (workspaceId
// set to null) via the column's onDelete: 'set null'; they are never deleted.
export async function deleteWorkspaceById({
  id,
  ownerId,
}: {
  id: string;
  ownerId: string;
}): Promise<void> {
  await db.delete(workspace).where(and(eq(workspace.id, id), eq(workspace.ownerId, ownerId)));
}
