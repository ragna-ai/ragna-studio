import type { GenerateImagesInput } from '@repo/ai';
import { createGenImages } from '@repo/ai';
import type { GenImage } from '@repo/database';
import { getGenImageCountByWorkspaceId, getGenImagesByWorkspaceId } from '@repo/database';
import { logger } from '@repo/logger';
import { buildImageUrls } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { InternalServerErrorException } from '../exceptions';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export interface GenImageResponse {
  id: string;
  prompt: string;
  createdAt: Date;
  rawUrl: string;
  imgUrl: string;
}

function toGenImageResponse(record: GenImage): GenImageResponse {
  return {
    id: record.id,
    prompt: record.prompt,
    createdAt: record.createdAt,
    ...buildImageUrls({ userId: record.userId, key: record.storageKey }),
  };
}

/**
 * [GET] /workspace/:workspaceId/gen-image
 * Lists a workspace's generated images, newest first by default.
 */
export async function listGenImages({
  workspaceId,
  page,
  limit,
  sort,
}: {
  workspaceId: string;
  page?: number | null;
  limit?: number | null;
  sort?: 'asc' | 'desc';
}): Promise<{ genImages: GenImageResponse[]; meta: { totalCount: number } }> {
  const resolvedPage = page && page > 0 ? page : DEFAULT_PAGE;
  const resolvedLimit = limit && limit > 0 ? limit : DEFAULT_LIMIT;
  const offset = (resolvedPage - 1) * resolvedLimit;

  const { error, data: records } = await tryCatch(() =>
    getGenImagesByWorkspaceId({ workspaceId, limit: resolvedLimit, offset, sort }),
  );

  if (error !== null || !records) {
    logger.error('Failed to list generated images', error);
    throw new InternalServerErrorException('Failed to list generated images');
  }

  // Same filter as the list query above, so meta.totalCount matches it exactly.
  const { error: countError, data: totalCount } = await tryCatch(() =>
    getGenImageCountByWorkspaceId({ workspaceId }),
  );

  if (countError !== null || totalCount === null) {
    logger.error('Failed to count generated images', countError);
    throw new InternalServerErrorException('Failed to count generated images');
  }

  return { genImages: records.map(toGenImageResponse), meta: { totalCount } };
}

/**
 * [POST] /workspace/:workspaceId/gen-image
 * Generates image(s) from a prompt and persists them in the workspace.
 */
export async function generateImagesForWorkspace({
  userId,
  workspaceId,
  input,
}: {
  userId: string;
  workspaceId: string;
  input: GenerateImagesInput;
}): Promise<{ genImages: GenImageResponse[] }> {
  const { error, data: generated } = await tryCatch(() =>
    createGenImages({ ...input, userId, workspaceId }),
  );

  if (error !== null || !generated) {
    logger.error('Image generation failed', error);
    throw new InternalServerErrorException('Image generation failed');
  }

  return { genImages: generated.images };
}
