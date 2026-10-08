import type { Workspace } from '@repo/database';
import {
  countWorkspacesByOwnerId,
  createWorkspace,
  deleteWorkspaceById,
  getAllWorkspacesByOwnerId,
  updateWorkspace,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';
import { deleteWorkspaceMediaObjects } from './media.service';

/**
 * [GET] /workspace
 * Lists all workspaces owned by the authenticated user.
 */
export async function listWorkspacesForUser({
  userId,
}: {
  userId: string;
}): Promise<Workspace[]> {
  const { error, data: workspaces } = await tryCatch(() =>
    getAllWorkspacesByOwnerId({ ownerId: userId }),
  );

  if (error !== null || !workspaces) {
    logger.error('Failed to list workspaces for user', error);
    throw new InternalServerErrorException('Failed to list workspaces for user');
  }

  return workspaces;
}

/**
 * [POST] /workspace
 * Creates a new workspace for the authenticated user.
 */
export async function createWorkspaceForUser({
  userId,
  name,
}: {
  userId: string;
  name: string;
}): Promise<Workspace> {
  const { error, data: workspaceRecord } = await tryCatch(() =>
    createWorkspace({ ownerId: userId, name }),
  );

  if (error !== null || !workspaceRecord) {
    logger.error('Failed to create workspace', error);
    throw new InternalServerErrorException('Failed to create workspace');
  }

  return workspaceRecord;
}

/**
 * [PATCH] /workspace/:workspaceId
 * Renames a workspace owned by the authenticated user.
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
  const { error, data: workspaceRecord } = await tryCatch(() =>
    updateWorkspace({ id: workspaceId, ownerId: userId, name }),
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
 * Deletes a workspace owned by the authenticated user. Rejects the delete
 * with 400 if it is the user's only workspace. Contained resources (agents,
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
  const { error, data: workspaceCount } = await tryCatch(() =>
    countWorkspacesByOwnerId({ ownerId: userId }),
  );

  if (error !== null || workspaceCount === null) {
    logger.error('Failed to count workspaces for user', error);
    throw new InternalServerErrorException('Failed to count workspaces for user');
  }

  if (workspaceCount <= 1) {
    throw new BadRequestException('Cannot delete your only workspace');
  }

  // Best-effort R2 cleanup for every media row this workspace owns, before
  // the FK cascade below wipes the rows for free but leaves the objects
  // orphaned.
  await deleteWorkspaceMediaObjects({ workspaceId });

  const { error: deleteError, data: deletedWorkspace } = await tryCatch(() =>
    deleteWorkspaceById({ id: workspaceId, ownerId: userId }),
  );

  if (deleteError !== null) {
    logger.error('Failed to delete workspace', deleteError);
    throw new InternalServerErrorException('Failed to delete workspace');
  }

  if (!deletedWorkspace) {
    throw new NotFoundException('Workspace not found');
  }
}
