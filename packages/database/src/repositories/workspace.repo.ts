import { and, count, eq } from 'drizzle-orm';
import { db } from '../db';
import { member, workspace, type Workspace } from '../schema';

export type { Workspace } from '../schema';

export async function createWorkspace({
  organizationId,
  name,
}: {
  organizationId: string;
  name: string;
}): Promise<Workspace> {
  const [createdWorkspace] = await db
    .insert(workspace)
    .values({ organizationId, name })
    .returning();

  if (!createdWorkspace) {
    throw new Error('Failed to create workspace');
  }

  return createdWorkspace;
}

export async function getAllWorkspacesByOrganizationId({
  organizationId,
}: {
  organizationId: string;
}): Promise<Workspace[]> {
  return db.query.workspace.findMany({
    where: { organizationId },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
}

/** Backs the "cannot delete last workspace" rule: an organization always keeps one workspace. */
export async function countWorkspacesByOrganizationId({
  organizationId,
}: {
  organizationId: string;
}): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(workspace)
    .where(eq(workspace.organizationId, organizationId));

  return result?.count ?? 0;
}

/** Returns the workspace only if the user is a member of its organization. */
export async function getWorkspaceForMember({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<Workspace | null> {
  const [row] = await db
    .select({ workspace })
    .from(workspace)
    .innerJoin(
      member,
      and(eq(member.organizationId, workspace.organizationId), eq(member.userId, userId)),
    )
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  return row?.workspace ?? null;
}

export async function updateWorkspace({
  id,
  organizationId,
  name,
}: {
  id: string;
  organizationId: string;
  name: string;
}): Promise<Workspace | null> {
  const [updatedWorkspace] = await db
    .update(workspace)
    .set({ name })
    .where(and(eq(workspace.id, id), eq(workspace.organizationId, organizationId)))
    .returning();

  return updatedWorkspace ?? null;
}

/**
 * Resources scoped to the workspace cascade-delete with it. Callers must reject deleting an
 * organization's last workspace first. Returns null when `id` is not in `organizationId`.
 */
export async function deleteWorkspaceById({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}): Promise<Workspace | null> {
  const [deletedWorkspace] = await db
    .delete(workspace)
    .where(and(eq(workspace.id, id), eq(workspace.organizationId, organizationId)))
    .returning();

  return deletedWorkspace ?? null;
}
