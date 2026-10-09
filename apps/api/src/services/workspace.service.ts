import type { Workspace } from '@repo/database';
import {
  countWorkspacesByOrganizationId,
  createWorkspace,
  deleteWorkspaceById,
  getAllWorkspacesByOrganizationId,
  getOrganizationIdByUserId,
  updateWorkspace,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { deleteWorkspaceMediaObjects } from './media.service';

async function requireOrganizationId({ userId }: { userId: string }): Promise<string> {
  const { error, data: organizationId } = await tryCatch(() =>
    getOrganizationIdByUserId({ userId }),
  );

  if (error !== null) {
    logger.error('Failed to resolve organization for user', error);
    throw new InternalServerErrorException('Failed to resolve organization for user');
  }

  if (!organizationId) {
    throw new NotFoundException('Organization not found');
  }

  return organizationId;
}

/**
 * [GET] /workspace
 * Lists all workspaces of the authenticated user's organization.
 */
export async function listWorkspacesForUser({ userId }: { userId: string }): Promise<Workspace[]> {
  const organizationId = await requireOrganizationId({ userId });
  const { error, data: workspaces } = await tryCatch(() =>
    getAllWorkspacesByOrganizationId({ organizationId }),
  );

  if (error !== null || !workspaces) {
    logger.error('Failed to list workspaces for user', error);
    throw new InternalServerErrorException('Failed to list workspaces for user');
  }

  return workspaces;
}

/**
 * [POST] /workspace
 * Creates a new workspace in the authenticated user's organization.
 */
export async function createWorkspaceForUser({
  userId,
  name,
}: {
  userId: string;
  name: string;
}): Promise<Workspace> {
  const organizationId = await requireOrganizationId({ userId });
  const { error, data: workspaceRecord } = await tryCatch(() =>
    createWorkspace({ ownerId: userId, organizationId, name }),
  );

  if (error !== null || !workspaceRecord) {
    logger.error('Failed to create workspace', error);
    throw new InternalServerErrorException('Failed to create workspace');
  }

  return workspaceRecord;
}

/**
 * [PATCH] /workspace/:workspaceId
 * Renames a workspace of the authenticated user's organization.
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
  const organizationId = await requireOrganizationId({ userId });
  const { error, data: workspaceRecord } = await tryCatch(() =>
    updateWorkspace({ id: workspaceId, organizationId, name }),
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
 * Deletes a workspace of the authenticated user's organization. Rejects the
 * delete with 400 if it is the organization's only workspace. Contained resources (agents,
 * chats, documents, ...) cascade-delete with it: their workspaceId FKs went
 * from `set null` to `cascade` in WP0, so nothing is "unassigned" anymore.
 */
export async function deleteWorkspaceForUser({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}): Promise<void> {
  const organizationId = await requireOrganizationId({ userId });
  const { error, data: workspaceCount } = await tryCatch(() =>
    countWorkspacesByOrganizationId({ organizationId }),
  );

  if (error !== null || workspaceCount === null) {
    logger.error('Failed to count workspaces for organization', error);
    throw new InternalServerErrorException('Failed to count workspaces for organization');
  }

  if (workspaceCount <= 1) {
    throw new BadRequestException('Cannot delete your only workspace');
  }

  // Best-effort R2 cleanup for every media row this workspace owns, before
  // the FK cascade below wipes the rows for free but leaves the objects
  // orphaned.
  await deleteWorkspaceMediaObjects({ workspaceId });

  const { error: deleteError, data: deletedWorkspace } = await tryCatch(() =>
    deleteWorkspaceById({ id: workspaceId, organizationId }),
  );

  if (deleteError !== null) {
    logger.error('Failed to delete workspace', deleteError);
    throw new InternalServerErrorException('Failed to delete workspace');
  }

  if (!deletedWorkspace) {
    throw new NotFoundException('Workspace not found');
  }
}
