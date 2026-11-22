import { alias } from 'drizzle-orm/pg-core';
import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { db } from '../db';
import {
  organization,
  organizationMember,
  user,
  workspace,
  workspaceMember,
  WORKSPACE_EDITOR_ROLE,
  WORKSPACE_MANAGER_ROLE,
  WORKSPACE_VISIBILITY_ORGANIZATION,
  WORKSPACE_VISIBILITY_PERSONAL,
  WORKSPACE_VISIBILITY_RESTRICTED,
  type Workspace,
  type WorkspaceRole,
} from '../schema';
import {
  ORGANIZATION_ADMIN_ROLE,
  ORGANIZATION_OWNER_ROLE,
  organizationRoleMatches,
} from './organization.repo';

export type { Workspace, WorkspaceRole, WorkspaceVisibility } from '../schema';
export {
  WORKSPACE_EDITOR_ROLE,
  WORKSPACE_MANAGER_ROLE,
  WORKSPACE_VISIBILITY_ORGANIZATION,
  WORKSPACE_VISIBILITY_PERSONAL,
  WORKSPACE_VISIBILITY_RESTRICTED,
} from '../schema';

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

export interface WorkspaceAccess {
  workspace: Workspace;
  workspaceRole: WorkspaceRole;
}

export interface WorkspaceAccessWithOrganizationRole extends WorkspaceAccess {
  /** The user's raw organization role (comma-separated), for rank checks above the workspace roles. */
  organizationRole: string;
}

const accessMember = alias(organizationMember, 'access_member');
const accessOrganization = alias(organization, 'access_organization');
const accessWorkspaceMember = alias(workspaceMember, 'access_workspace_member');

/** The user to check: a literal id, or a column/expression of the surrounding query. */
export type WorkspaceAccessUser = string | AnyColumn | SQL;

/**
 * Correlated scalar subquery: the user's workspace role in the surrounding query's `workspaces`
 * row, or NULL when they have no access. The one place the visibility rules live.
 * Drizzle drops column qualifiers in single-table selects, so a query that selects this
 * must join another table to keep the correlation.
 */
export function workspaceRoleSql({
  userId,
}: {
  userId: WorkspaceAccessUser;
}): SQL<WorkspaceRole | null> {
  const isOrganizationOwnerOrAdmin = or(
    organizationRoleMatches(accessMember.role, ORGANIZATION_OWNER_ROLE),
    organizationRoleMatches(accessMember.role, ORGANIZATION_ADMIN_ROLE),
  );

  return sql<WorkspaceRole | null>`(
    select case
      when ${workspace.visibility} = ${WORKSPACE_VISIBILITY_PERSONAL} then
        case when ${workspace.personalUserId} = ${userId} then ${WORKSPACE_MANAGER_ROLE} end
      when ${isOrganizationOwnerOrAdmin} then ${WORKSPACE_MANAGER_ROLE}
      when ${workspace.visibility} = ${WORKSPACE_VISIBILITY_ORGANIZATION} then
        coalesce(${accessWorkspaceMember.role}, ${WORKSPACE_EDITOR_ROLE})
      else ${accessWorkspaceMember.role}
    end
    from ${organizationMember} as access_member
    inner join ${organization} as access_organization on ${accessOrganization.id} = ${accessMember.organizationId}
    left join ${workspaceMember} as access_workspace_member
      on ${accessWorkspaceMember.workspaceId} = ${workspace.id}
      and ${accessWorkspaceMember.userId} = ${userId}
    where ${accessMember.organizationId} = ${workspace.organizationId}
      and ${accessMember.userId} = ${userId}
      and ${accessOrganization.deletedAt} is null
  )`;
}

/** Filters a query on `workspaces` to the rows the user can open. */
export function workspaceAccessCondition({ userId }: { userId: WorkspaceAccessUser }): SQL {
  return isNotNull(workspaceRoleSql({ userId }));
}

/** Returns the workspace and the user's role in it, or null when the user cannot open it. */
export async function getWorkspaceAccess({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<WorkspaceAccessWithOrganizationRole | null> {
  const [row] = await db
    .select({
      workspace,
      workspaceRole: workspaceRoleSql({ userId }),
      organizationRole: organizationMember.role,
    })
    .from(workspace)
    .innerJoin(organization, eq(organization.id, workspace.organizationId))
    .innerJoin(
      organizationMember,
      and(
        eq(organizationMember.organizationId, workspace.organizationId),
        eq(organizationMember.userId, userId),
      ),
    )
    .where(and(eq(workspace.id, workspaceId), workspaceAccessCondition({ userId })))
    .limit(1);

  if (!row || !row.workspaceRole) return null;
  return {
    workspace: row.workspace,
    workspaceRole: row.workspaceRole,
    organizationRole: row.organizationRole,
  };
}

export interface WorkspaceUserRoles {
  userId: string;
  /** Null when the user can no longer open the workspace. */
  workspaceRole: WorkspaceRole | null;
  organizationRole: string | null;
}

/** The roles of several users in one workspace, in one query. Users without access get a null role. */
export async function getWorkspaceUserRoles({
  workspaceId,
  userIds,
}: {
  workspaceId: string;
  userIds: string[];
}): Promise<WorkspaceUserRoles[]> {
  if (userIds.length === 0) return [];

  return db
    .select({
      userId: user.id,
      workspaceRole: workspaceRoleSql({ userId: user.id }),
      organizationRole: organizationMember.role,
    })
    .from(workspace)
    .innerJoin(user, inArray(user.id, userIds))
    .leftJoin(
      organizationMember,
      and(
        eq(organizationMember.organizationId, workspace.organizationId),
        eq(organizationMember.userId, user.id),
      ),
    )
    .where(eq(workspace.id, workspaceId));
}

/**
 * Workspaces for the switcher: organization ones, the user's personal one, and restricted ones
 * where the user is a workspace member. Organization owners and admins can open every restricted
 * workspace but do not get them listed here.
 */
export async function listAccessibleWorkspaces({
  userId,
}: {
  userId: string;
}): Promise<WorkspaceAccess[]> {
  const isWorkspaceMember = exists(
    db
      .select({ id: workspaceMember.id })
      .from(workspaceMember)
      .where(
        and(eq(workspaceMember.workspaceId, workspace.id), eq(workspaceMember.userId, userId)),
      ),
  );

  const rows = await db
    .select({ workspace, workspaceRole: workspaceRoleSql({ userId }) })
    .from(workspace)
    .innerJoin(organization, eq(organization.id, workspace.organizationId))
    .where(
      and(
        workspaceAccessCondition({ userId }),
        or(ne(workspace.visibility, WORKSPACE_VISIBILITY_RESTRICTED), isWorkspaceMember),
      ),
    )
    .orderBy(workspace.createdAt);

  return rows.flatMap((row) =>
    row.workspaceRole ? [{ workspace: row.workspace, workspaceRole: row.workspaceRole }] : [],
  );
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
 * Resources scoped to the workspace cascade-delete with it.
 * Returns null when `id` is not in `organizationId`.
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
