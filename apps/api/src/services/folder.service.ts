import type { Folder } from '@repo/database';
import {
  createFolder,
  deleteFolderById,
  getFoldersByWorkspaceId,
  renameFolder,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { InternalServerErrorException, NotFoundException } from '../exceptions';

/**
 * [GET] /workspace/:workspaceId/folder
 */
export async function listFolders({ workspaceId }: { workspaceId: string }): Promise<Folder[]> {
  const { error, data: folders } = await tryCatch(() => getFoldersByWorkspaceId({ workspaceId }));

  if (error !== null || !folders) {
    logger.error('Failed to list folders', error);
    throw new InternalServerErrorException('Failed to list folders');
  }

  return folders;
}

/**
 * [POST] /workspace/:workspaceId/folder
 */
export async function createFolderForUser({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}): Promise<Folder> {
  const { error, data: createdFolder } = await tryCatch(() => createFolder({ workspaceId, name }));

  if (error !== null || !createdFolder) {
    logger.error('Failed to create folder', error);
    throw new InternalServerErrorException('Failed to create folder');
  }

  return createdFolder;
}

/**
 * [PATCH] /workspace/:workspaceId/folder/:folderId
 */
export async function renameFolderForUser({
  workspaceId,
  folderId,
  name,
}: {
  workspaceId: string;
  folderId: string;
  name: string;
}): Promise<Folder> {
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
 * [DELETE] /workspace/:workspaceId/folder/:folderId
 * Documents in this folder move to root, they are not deleted (see the FK
 * in document.schema.ts).
 */
export async function deleteFolder({
  workspaceId,
  folderId,
}: {
  workspaceId: string;
  folderId: string;
}): Promise<void> {
  await deleteFolderById({ folderId, workspaceId });
}
