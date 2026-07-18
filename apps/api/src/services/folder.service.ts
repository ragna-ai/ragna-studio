import type { Folder } from '@repo/database';
import { createFolder, deleteFolderById, getFoldersByWorkspaceId, renameFolder } from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { InternalServerErrorException, NotFoundException } from '../exceptions';
import { loadOwnedWorkspace } from './document.service';

/**
 * [GET] /workspace/:workspaceId/folders
 */
export async function listFolders({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<Folder[]> {
  await loadOwnedWorkspace({ workspaceId, userId });

  const { error, data: folders } = await tryCatch(() => getFoldersByWorkspaceId({ workspaceId }));

  if (error !== null || !folders) {
    logger.error('Failed to list folders', error);
    throw new InternalServerErrorException('Failed to list folders');
  }

  return folders;
}

/**
 * [POST] /workspace/:workspaceId/folders
 */
export async function createFolderForUser({
  workspaceId,
  userId,
  name,
}: {
  workspaceId: string;
  userId: string;
  name: string;
}): Promise<Folder> {
  await loadOwnedWorkspace({ workspaceId, userId });

  const { error, data: createdFolder } = await tryCatch(() => createFolder({ workspaceId, name }));

  if (error !== null || !createdFolder) {
    logger.error('Failed to create folder', error);
    throw new InternalServerErrorException('Failed to create folder');
  }

  return createdFolder;
}

/**
 * [PATCH] /workspace/:workspaceId/folders/:folderId
 */
export async function renameFolderForUser({
  workspaceId,
  userId,
  folderId,
  name,
}: {
  workspaceId: string;
  userId: string;
  folderId: string;
  name: string;
}): Promise<Folder> {
  await loadOwnedWorkspace({ workspaceId, userId });

  const { error, data: updatedFolder } = await tryCatch(() =>
    renameFolder({ folderId, workspaceId, name }),
  );

  if (error !== null) {
    logger.error('Failed to rename folder', error);
    throw new InternalServerErrorException('Failed to rename folder');
  }

  if (!updatedFolder) {
    throw new NotFoundException('Folder not found');
  }

  return updatedFolder;
}

/**
 * [DELETE] /workspace/:workspaceId/folders/:folderId
 * Documents in this folder move to root, they are not deleted (see the FK
 * in document.schema.ts).
 */
export async function deleteFolder({
  workspaceId,
  userId,
  folderId,
}: {
  workspaceId: string;
  userId: string;
  folderId: string;
}): Promise<void> {
  await loadOwnedWorkspace({ workspaceId, userId });

  await deleteFolderById({ folderId, workspaceId });
}
