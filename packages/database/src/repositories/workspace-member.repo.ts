import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  organizationMember,
  user,
  workspace,
  workspaceMember,
  WORKSPACE_EDITOR_ROLE,
  WORKSPACE_MANAGER_ROLE,
  WORKSPACE_VISIBILITY_RESTRICTED,
  type NewWorkspaceMember,
  type Workspace,
  type WorkspaceRole,
  type WorkspaceVisibility,
} from '../schema';

export interface CreateWorkspaceWithMembersInput {
  organizationId: string;
  name: string;
  visibility: Extract<WorkspaceVisibility, 'organization' | 'restricted'>;
  managerUserId: string;
  editorUserIds: string[];
}

/** Inserts the workspace, the creator's manager row and the editor rows in one transaction. */
export async function createWorkspaceWithMembers({
  organizationId,
  name,
  visibility,
  managerUserId,
  editorUserIds,
}: CreateWorkspaceWithMembersInput): Promise<Workspace> {
  return db.transaction(async (tx) => {
    const [createdWorkspace] = await tx
      .insert(workspace)
      .values({ organizationId, name, visibility })
      .returning();

    if (!createdWorkspace) {
      throw new Error('Failed to create workspace');
    }

    const managerRow: NewWorkspaceMember = {
      workspaceId: createdWorkspace.id,
      userId: managerUserId,
      role: WORKSPACE_MANAGER_ROLE,
    };
    const editorRows = editorUserIds.map((userId): NewWorkspaceMember => ({
      workspaceId: createdWorkspace.id,
      userId,
      role: WORKSPACE_EDITOR_ROLE,
    }));
    await tx.insert(workspaceMember).values([managerRow, ...editorRows]);

    return createdWorkspace;
  });
}

/** Returns the subset of `userIds` that are active (not soft-deleted) members of the organization. */
export async function filterActiveOrganizationMemberUserIds({
  organizationId,
  userIds,
}: {
  organizationId: string;
  userIds: string[];
}): Promise<string[]> {
  if (userIds.length === 0) return [];

  const rows = await db
    .select({ userId: organizationMember.userId })
    .from(organizationMember)
    .innerJoin(user, eq(user.id, organizationMember.userId))
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        inArray(organizationMember.userId, userIds),
        isNull(user.deletedAt),
      ),
    );

  return rows.map((row) => row.userId);
}

export interface WorkspaceMemberListItem {
  userId: string;
  workspaceRole: WorkspaceRole;
  createdAt: Date;
  name: string;
  email: string;
  image: string | null;
}

export async function listWorkspaceMembers({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<WorkspaceMemberListItem[]> {
  return db
    .select({
      userId: workspaceMember.userId,
      workspaceRole: workspaceMember.role,
      createdAt: workspaceMember.createdAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(eq(workspaceMember.workspaceId, workspaceId))
    .orderBy(workspaceMember.createdAt);
}

/** Returns false when the user already has a row in the workspace. */
export async function insertWorkspaceMember({
  workspaceId,
  userId,
  workspaceRole,
}: {
  workspaceId: string;
  userId: string;
  workspaceRole: WorkspaceRole;
}): Promise<boolean> {
  const rows = await db
    .insert(workspaceMember)
    .values({ workspaceId, userId, role: workspaceRole })
    .onConflictDoNothing()
    .returning({ id: workspaceMember.id });

  return rows.length > 0;
}

/** Returns false when the user has no row in the workspace. */
export async function updateWorkspaceMemberRole({
  workspaceId,
  userId,
  workspaceRole,
}: {
  workspaceId: string;
  userId: string;
  workspaceRole: WorkspaceRole;
}): Promise<boolean> {
  const rows = await db
    .update(workspaceMember)
    .set({ role: workspaceRole })
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)))
    .returning({ id: workspaceMember.id });

  return rows.length > 0;
}

/** Returns false when the user has no row in the workspace. */
export async function deleteWorkspaceMember({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<boolean> {
  const rows = await db
    .delete(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)))
    .returning({ id: workspaceMember.id });

  return rows.length > 0;
}

export interface RestrictedWorkspaceListItem {
  id: string;
  name: string;
  memberCount: number;
  isWorkspaceMember: boolean;
  createdAt: Date;
}

/** Every restricted workspace of the organization with its member count, in one query. */
export async function listRestrictedWorkspaces({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}): Promise<RestrictedWorkspaceListItem[]> {
  return db
    .select({
      id: workspace.id,
      name: workspace.name,
      memberCount: count(workspaceMember.id),
      isWorkspaceMember: sql<boolean>`coalesce(bool_or(${workspaceMember.userId} = ${userId}), false)`,
      createdAt: workspace.createdAt,
    })
    .from(workspace)
    .leftJoin(workspaceMember, eq(workspaceMember.workspaceId, workspace.id))
    .where(
      and(
        eq(workspace.organizationId, organizationId),
        eq(workspace.visibility, WORKSPACE_VISIBILITY_RESTRICTED),
      ),
    )
    .groupBy(workspace.id)
    .orderBy(workspace.createdAt);
}
