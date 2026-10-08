import { and, count, eq } from 'drizzle-orm';
import { db } from '../db';
import { workspace, type Workspace } from '../schema';

export type { Workspace } from '../schema';

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

// Used by the "cannot delete last workspace" rule (WP1): a user must always
// keep at least one workspace.
export async function countWorkspacesByOwnerId({ ownerId }: { ownerId: string }): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(workspace)
    .where(eq(workspace.ownerId, ownerId));

  return result?.count ?? 0;
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

// Resources scoped to this workspace are deleted with it: their workspaceId
// FK is onDelete: 'cascade'. Callers must reject
// deleting a user's last workspace before calling this (see WP1's
// workspace.service.ts). Returns the deleted row (or null if `id` didn't
// belong to `ownerId`), mirroring `updateWorkspace`, so the caller can 404
// instead of a silent no-op.
export async function deleteWorkspaceById({
  id,
  ownerId,
}: {
  id: string;
  ownerId: string;
}): Promise<Workspace | null> {
  const [deletedWorkspace] = await db
    .delete(workspace)
    .where(and(eq(workspace.id, id), eq(workspace.ownerId, ownerId)))
    .returning();

  return deletedWorkspace ?? null;
}
