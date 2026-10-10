import { db, sql } from '@repo/database';
import { workspace, workspaceMember, type WorkspaceRole } from '@repo/database/schema';
import type { WorkspaceVisibility } from '@repo/database';
import { seedAuthenticatedUser, seedOrganizationMember } from '@repo/testing';
import { app } from '../../src/app';

export type SeededUser = Awaited<ReturnType<typeof seedAuthenticatedUser>>;

export interface OrganizationWithRoles {
  organizationId: string;
  owner: SeededUser;
  admin: SeededUser;
  member: SeededUser;
  otherMember: SeededUser;
}

/** One organization with an org owner, an org admin and two plain org members. */
export async function seedOrganizationWithRoles(): Promise<OrganizationWithRoles> {
  const owner = await seedAuthenticatedUser();
  const ownerMembership = await db.query.organizationMember.findFirst({
    where: { userId: owner.userId },
  });
  const organizationId = ownerMembership?.organizationId ?? '';
  const admin = await seedOrganizationMember({ organizationId, role: 'admin' });
  const member = await seedOrganizationMember({ organizationId, role: 'member' });
  const otherMember = await seedOrganizationMember({ organizationId, role: 'member' });
  return { organizationId, owner, admin, member, otherMember };
}

export async function insertWorkspace({
  organizationId,
  visibility,
  name = 'Team',
}: {
  organizationId: string;
  visibility: Exclude<WorkspaceVisibility, 'personal'>;
  name?: string;
}): Promise<string> {
  const [row] = await db
    .insert(workspace)
    .values({ organizationId, visibility, name })
    .returning({ id: workspace.id });
  if (!row) throw new Error('Failed to insert workspace');
  return row.id;
}

export async function insertWorkspaceMember({
  workspaceId,
  userId,
  role,
}: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}): Promise<void> {
  await db.insert(workspaceMember).values({ workspaceId, userId, role });
}

export async function deleteWorkspaceMember({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<void> {
  await db
    .delete(workspaceMember)
    .where(
      sql`${workspaceMember.workspaceId} = ${workspaceId} and ${workspaceMember.userId} = ${userId}`,
    );
}

/** GET /workspace/:id/folder: a route that only runs `workspaceGuard`, so its status is the guard's verdict. */
export function requestFolders(workspaceId: string, cookieHeader: string) {
  return app.request(`/workspace/${workspaceId}/folder`, { headers: { cookie: cookieHeader } });
}
