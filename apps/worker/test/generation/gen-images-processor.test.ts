import { getGenImageRowsByIds } from '@repo/database';
import { GEN_IMAGES_JOB, NOTIFY_USER_JOB } from '@repo/queue';
import {
  imageModelGenerateMock,
  enqueuedJobs,
  queueAddMock,
  resetProviderMocks,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processGenImagesJob } from '../../src/processors/gen-images.processor';
import { seedGenImageBatch } from '../support/generation-fixtures';
import { buildJob } from '../support/job';

const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];

describe('processGenImagesJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('success completes the rows and notifies the author once per batch', async () => {
    const { userId, workspaceId, rows } = await seedGenImageBatch({ count: 2 });
    const genImageIds = rows.map((row) => row.id);

    const result = await processGenImagesJob(
      buildJob({ name: GEN_IMAGES_JOB, data: { genImageIds } }),
    );

    const updated = await getGenImageRowsByIds({ ids: genImageIds });
    expect(result).toEqual({ success: true });
    expect(updated.map((row) => row.status)).toEqual(['completed', 'completed']);
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(1);
    expect(queueAddMock).toHaveBeenCalledWith(NOTIFY_USER_JOB, {
      userId,
      type: 'image_generation_succeeded',
      data: { genImageIds, workspaceId, prompt: 'a red bicycle' },
    });
  });

  test('failure marks the rows failed, notifies and rethrows', async () => {
    const { userId, rows } = await seedGenImageBatch({ count: 2 });
    const genImageIds = rows.map((row) => row.id);
    imageModelGenerateMock.mockImplementationOnce(() =>
      Promise.reject(new Error('provider exploded')),
    );

    const run = processGenImagesJob(buildJob({ name: GEN_IMAGES_JOB, data: { genImageIds } }));

    await expect(run).rejects.toThrow();
    const updated = await getGenImageRowsByIds({ ids: genImageIds });
    expect(updated.map((row) => row.status)).toEqual(['failed', 'failed']);
    expect(updated.every((row) => row.error)).toBe(true);
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(1);
    expect(enqueuedJobs(NOTIFY_USER_JOB)[0]?.[1]).toMatchObject({
      userId,
      type: 'image_generation_failed',
    });
  });

  test('a batch without an author fails without a notification', async () => {
    const { rows } = await seedGenImageBatch({ withAuthor: false });
    const genImageIds = rows.map((row) => row.id);

    const run = processGenImagesJob(buildJob({ name: GEN_IMAGES_JOB, data: { genImageIds } }));

    await expect(run).rejects.toThrow('no author');
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(0);
  });

  test('bfl sends the resolution tier and ratio, no seed and no size', async () => {
    const { rows } = await seedGenImageBatch({
      count: 1,
      resolution: '2K',
      aspectRatio: '16:9',
      seed: 42,
    });

    await processGenImagesJob(
      buildJob({ name: GEN_IMAGES_JOB, data: { genImageIds: rows.map((row) => row.id) } }),
    );

    const [options] = imageModelGenerateMock.mock.calls[0] ?? [];
    expect(options?.providerOptions).toEqual({ blackForestLabs: { resolution: '2k' } });
    expect(options?.aspectRatio).toBe('16:9');
    expect(options?.seed).toBeUndefined();
    expect(options?.size).toBeUndefined();
  });

  test('bfl maps 1K to the 1k tier', async () => {
    const { rows } = await seedGenImageBatch({ count: 1, resolution: '1K' });

    await processGenImagesJob(
      buildJob({ name: GEN_IMAGES_JOB, data: { genImageIds: rows.map((row) => row.id) } }),
    );

    const [options] = imageModelGenerateMock.mock.calls[0] ?? [];
    expect(options?.providerOptions).toEqual({ blackForestLabs: { resolution: '1k' } });
  });

  test('stores the real media type of the generated image', async () => {
    const { rows } = await seedGenImageBatch({ count: 1 });
    const genImageIds = rows.map((row) => row.id);
    imageModelGenerateMock.mockImplementationOnce(() =>
      Promise.resolve({
        images: [new Uint8Array(JPEG_BYTES)],
        warnings: [],
        response: { timestamp: new Date(), modelId: 'flux-3-image', headers: undefined },
      }),
    );

    await processGenImagesJob(buildJob({ name: GEN_IMAGES_JOB, data: { genImageIds } }));

    const [updated] = await getGenImageRowsByIds({ ids: genImageIds });
    expect(updated?.media?.storageKey).toEndWith('.jpg');
    expect(updated?.media?.mimeType).toBe('image/jpeg');
  });

  test('unknown job name throws', async () => {
    const job = buildJob({ name: 'not-a-real-job', data: {} });

    await expect(processGenImagesJob(job)).rejects.toThrow('Unknown gen-images job');
  });
});
