import type { GenImage } from '@repo/database';
import { getGenImagesByUserId } from '@repo/database';
import { buildImageUrls } from '@repo/storage';
import { tryCatch } from '@repo/utils';

export async function getGenImagesForUser({
  userId,
  workspaceId,
  unassigned,
}: {
  userId: string;
  workspaceId?: string;
  unassigned?: boolean;
}) {
  const { error, data: records } = await tryCatch(() =>
    getGenImagesByUserId({ userId, workspaceId, unassigned }),
  );

  if (error !== null || !records) {
    throw new Error('Failed to list generated images');
  }

  return records.map(toGenImageDto);
}

function toGenImageDto(record: GenImage) {
  return {
    id: record.id,
    prompt: record.prompt,
    createdAt: record.createdAt,
    ...buildImageUrls({ userId: record.userId, key: record.storageKey }),
  };
}
