import { createAgent, createMedia, getMediaById, type Media } from '@repo/database';
import { deleteMediaIfUnreferenced, sweepUnreferencedMedia } from '@repo/media';
import {
  deleteObjectsMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

// The media sweep and the batch delete every detach point shares. R2 is faked at the
// @repo/storage boundary.

async function seedMedia(workspaceId: string, bucket: string, name: string): Promise<Media> {
  return createMedia({
    ownerWorkspaceId: workspaceId,
    bucket,
    storageKey: `${workspaceId}/media/${name}`,
    filename: name,
    mimeType: 'image/png',
    size: 10,
    origin: 'uploaded',
  });
}

async function existingIds(ids: string[]): Promise<string[]> {
  const rows = await Promise.all(ids.map((id) => getMediaById({ id })));
  return rows.flatMap((row) => (row ? [row.id] : []));
}

function deletedKeys(): string[] {
  return deleteObjectsMock.mock.calls.flatMap(([, keys]) => keys);
}

describe('media sweep', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('deletes every unreferenced media row and object across buckets', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const images = await Promise.all([
      seedMedia(workspaceId, 'images', 'a'),
      seedMedia(workspaceId, 'images', 'b'),
    ]);
    const documents = await seedMedia(workspaceId, 'documents', 'c');
    const all = [...images, documents];

    const result = await sweepUnreferencedMedia({ olderThanHours: 0 });

    expect(result.candidateCount).toBe(3);
    expect(await existingIds(all.map((row) => row.id))).toEqual([]);
    expect(deletedKeys().sort()).toEqual(all.map((row) => row.storageKey).sort());
    expect(deleteObjectsMock).toHaveBeenCalledTimes(2);
  });

  test('keeps the row of a media whose object failed to delete and deletes the rest', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const stuck = await seedMedia(workspaceId, 'images', 'stuck');
    const fine = await seedMedia(workspaceId, 'images', 'fine');
    deleteObjectsMock.mockImplementationOnce((_bucket, keys) =>
      Promise.resolve({
        deleted: keys.filter((key) => key !== stuck.storageKey),
        errors: [stuck.storageKey],
      }),
    );

    await sweepUnreferencedMedia({ olderThanHours: 0 });

    expect(await existingIds([stuck.id, fine.id])).toEqual([stuck.id]);
  });

  test('keeps the rows of a bucket whose whole delete call failed', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const kept = await seedMedia(workspaceId, 'images', 'kept');
    deleteObjectsMock.mockImplementationOnce(() => {
      throw new Error('R2 is down');
    });

    await sweepUnreferencedMedia({ olderThanHours: 0 });

    expect(await existingIds([kept.id])).toEqual([kept.id]);
  });

  test('processes at most the given limit per run, oldest first', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const oldest = await seedMedia(workspaceId, 'images', 'oldest');
    const middle = await seedMedia(workspaceId, 'images', 'middle');
    const newest = await seedMedia(workspaceId, 'images', 'newest');

    const result = await sweepUnreferencedMedia({ olderThanHours: 0, limit: 2 });

    expect(result.candidateCount).toBe(2);
    expect(await existingIds([oldest.id, middle.id, newest.id])).toEqual([newest.id]);
  });
});

describe('deleteMediaIfUnreferenced', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('keeps a media that picked up a reference after it was chosen, deletes the others', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const referenced = await seedMedia(workspaceId, 'images', 'referenced');
    const free = await seedMedia(workspaceId, 'images', 'free');
    await createAgent({
      userId,
      workspaceId,
      name: 'Marked',
      aiModelId,
      systemPrompt: 'Be brief.',
      imageMediaId: referenced.id,
    });

    await deleteMediaIfUnreferenced({ mediaIds: [referenced.id, free.id] });

    expect(await existingIds([referenced.id, free.id])).toEqual([referenced.id]);
    expect(deletedKeys()).toEqual([free.storageKey]);
  });

  test('does nothing for an empty list', async () => {
    await deleteMediaIfUnreferenced({ mediaIds: [] });

    expect(deleteObjectsMock).not.toHaveBeenCalled();
  });
});
