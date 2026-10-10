import { getGenVideoById } from '@repo/database';
import { GEN_VIDEO_JOB, NOTIFY_USER_JOB } from '@repo/queue';
import {
  enqueuedJobs,
  queueAddMock,
  resetProviderMocks,
  truncateAllTables,
  videoModelGenerateMock,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processGenVideoJob } from '../../src/processors/gen-video.processor';
import { seedGenVideo } from '../support/generation-fixtures';
import { buildJob } from '../support/job';

describe('processGenVideoJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('success completes the row and notifies the author', async () => {
    const { userId, workspaceId, row } = await seedGenVideo();

    const result = await processGenVideoJob(
      buildJob({ name: GEN_VIDEO_JOB, data: { genVideoId: row.id } }),
    );

    const updated = await getGenVideoById({ id: row.id });
    expect(result).toEqual({ success: true });
    expect(videoModelGenerateMock).toHaveBeenCalledTimes(1);
    expect(updated?.status).toBe('completed');
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(1);
    expect(queueAddMock).toHaveBeenCalledWith(NOTIFY_USER_JOB, {
      userId,
      type: 'video_generation_succeeded',
      data: { genVideoId: row.id, workspaceId, prompt: 'a drone shot over a city' },
    });
  });

  test('failure marks the row failed, notifies and rethrows', async () => {
    const { userId, row } = await seedGenVideo();
    videoModelGenerateMock.mockImplementationOnce(() =>
      Promise.reject(new Error('provider exploded')),
    );

    const run = processGenVideoJob(buildJob({ name: GEN_VIDEO_JOB, data: { genVideoId: row.id } }));

    await expect(run).rejects.toThrow();
    const updated = await getGenVideoById({ id: row.id });
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toBeTruthy();
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(1);
    expect(enqueuedJobs(NOTIFY_USER_JOB)[0]?.[1]).toMatchObject({
      userId,
      type: 'video_generation_failed',
    });
  });

  test('a row without an author fails without a notification', async () => {
    const { row } = await seedGenVideo({ withAuthor: false });

    const run = processGenVideoJob(buildJob({ name: GEN_VIDEO_JOB, data: { genVideoId: row.id } }));

    await expect(run).rejects.toThrow('no author');
    expect(videoModelGenerateMock).not.toHaveBeenCalled();
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(0);
  });

  test('unknown job name throws', async () => {
    const job = buildJob({ name: 'not-a-real-job', data: {} });

    await expect(processGenVideoJob(job)).rejects.toThrow('Unknown gen-video job');
  });
});
