import type { Workspace, WorkspaceRole, WorkspaceVisibility } from '@repo/database';
import {
  createWorkspaceWithMembers,
  deleteWorkspaceById,
  filterActiveOrganizationMemberUserIds,
  getWorkspaceAccess,
  listAccessibleWorkspaces,
  updateWorkspace,
  WORKSPACE_MANAGER_ROLE,
  WORKSPACE_VISIBILITY_PERSONAL,
  WORKSPACE_VISIBILITY_RESTRICTED,
  type WorkspaceAccess,
} from '@repo/database';
import { logger } from '@repo/logger';
import { deleteWorkspaceMediaObjects } from '@repo/media';
import { tryCatch } from '@repo/utils';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { requireActiveOrganizationId as requireOrganizationId } from './organization.service';

export interface AccessibleWorkspaceResponse {
  id: string;
  organizationId: string;
  name: string;
  visibility: WorkspaceVisibility;
  workspaceRole: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * [GET] /workspace
 * Lists the workspaces the authenticated user can switch to, with their role in each.
 */
export async function listWorkspacesForUser({
  userId,
}: {
  userId: string;
}): Promise<AccessibleWorkspaceResponse[]> {
  await requireOrganizationId({ userId });
  const { error, data: accessList } = await tryCatch(() => listAccessibleWorkspaces({ userId }));

  if (error !== null || !accessList) {
    logger.error('Failed to list workspaces for user', error);
    throw new InternalServerErrorException('Failed to list workspaces for user');
  }

  return accessList.map(({ workspace, workspaceRole }) => ({
    id: workspace.id,
    organizationId: workspace.organizationId,
    name: workspace.name,
    visibility: workspace.visibility,
    workspaceRole,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    deletedAt: workspace.deletedAt,
  }));
}

export interface CreateWorkspaceInput {
  userId: string;
  name: string;
  visibility: Exclude<WorkspaceVisibility, 'personal'>;
  memberUserIds?: string[];
}

/**
 * [POST] /workspace
 * Creates a workspace in the caller's organization. The caller becomes workspace manager and
 * `memberUserIds` (restricted only) join as workspace editors. The caller's own id in the list
 * is dropped, so they keep the manager row.
 */
export async function createWorkspaceForUser({
  userId,
  name,
  visibility,
  memberUserIds,
}: CreateWorkspaceInput): Promise<Workspace> {
  if (memberUserIds && visibility !== WORKSPACE_VISIBILITY_RESTRICTED) {
    throw new BadRequestException('memberUserIds is only allowed for restricted workspaces');
  }

  const organizationId = await requireOrganizationId({ userId });
  const editorUserIds = [...new Set(memberUserIds ?? [])].filter((id) => id !== userId);

  const activeUserIds = await filterActiveOrganizationMemberUserIds({
    organizationId,
    userIds: editorUserIds,
  });
  if (activeUserIds.length !== editorUserIds.length) {
    throw new BadRequestException('Every member must be an active member of your organization');
  }

  const { error, data: workspaceRecord } = await tryCatch(() =>
    createWorkspaceWithMembers({
      organizationId,
      name,
      visibility,
      managerUserId: userId,
      editorUserIds,
    }),
  );

  if (error !== null || !workspaceRecord) {
    logger.error('Failed to create workspace', error);
    throw new InternalServerErrorException('Failed to create workspace');
  }

  return workspaceRecord;
}

/** Loads the workspace for a manager-only action: 404 without access, 403 for editors. */
async function requireWorkspaceManagerAccess({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}): Promise<WorkspaceAccess> {
  await requireOrganizationId({ userId });
  const access = await getWorkspaceAccess({ workspaceId, userId });
  if (!access) throw new NotFoundException('Workspace not found');
  if (access.workspaceRole !== WORKSPACE_MANAGER_ROLE) throw new ForbiddenException();
  return access;
}

/**
 * [PATCH] /workspace/:workspaceId
 * Renames a workspace. Workspace managers only.
 */
export async function renameWorkspaceForUser({
  userId,
  workspaceId,
  name,
}: {
  userId: string;
  workspaceId: string;
  name: string;
}): Promise<Workspace> {
  const { workspace } = await requireWorkspaceManagerAccess({ userId, workspaceId });
  const { error, data: workspaceRecord } = await tryCatch(() =>
    updateWorkspace({ id: workspace.id, organizationId: workspace.organizationId, name }),
  );

  if (error !== null) {
    logger.error('Failed to rename workspace', error);
    throw new InternalServerErrorException('Failed to rename workspace');
  }

  if (!workspaceRecord) {
    throw new NotFoundException('Workspace not found');
  }

  return workspaceRecord;
}

/**
 * [DELETE] /workspace/:workspaceId
 * Deletes a workspace. Workspace managers only; personal workspaces cannot be deleted.
 * Contained resources (agents, chats, documents, ...) cascade-delete with it.
 */
export async function deleteWorkspaceForUser({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}): Promise<void> {
  const { workspace } = await requireWorkspaceManagerAccess({ userId, workspaceId });

  if (workspace.visibility === WORKSPACE_VISIBILITY_PERSONAL) {
    throw new BadRequestException('A personal workspace cannot be deleted');
  }

  // Best-effort R2 cleanup for every media row this workspace owns, before
  // the FK cascade below wipes the rows for free but leaves the objects
  // orphaned.
  await deleteWorkspaceMediaObjects({ workspaceId: workspace.id });

  const { error: deleteError, data: deletedWorkspace } = await tryCatch(() =>
    deleteWorkspaceById({ id: workspace.id, organizationId: workspace.organizationId }),
  );

  if (deleteError !== null) {
    logger.error('Failed to delete workspace', deleteError);
    throw new InternalServerErrorException('Failed to delete workspace');
  }

  if (!deletedWorkspace) {
    throw new NotFoundException('Workspace not found');
  }
}
