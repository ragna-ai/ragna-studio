import { EXTRACT_MEDIA_TEXT_JOB } from '@repo/queue';
import {
  queueAddBulkMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { mediaTextExtractionSweepProcessor } from '../../src/crons/media-text-extraction-sweep.cron';
import { seedMedia } from '../support/media-fixtures';

const MINUTE_MS = 60 * 1000;

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * MINUTE_MS);
}

describe('media text extraction sweep cron', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('re-queues only rows pending for more than 10 minutes, in one bulk add', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const stale = await seedMedia({ workspaceId, createdAt: minutesAgo(11) });
    const alsoStale = await seedMedia({ workspaceId, createdAt: minutesAgo(60) });
    await seedMedia({ workspaceId, createdAt: minutesAgo(5) });
    await seedMedia({ workspaceId, textExtractionStatus: 'ready', createdAt: minutesAgo(60) });
    await seedMedia({ workspaceId, textExtractionStatus: 'failed', createdAt: minutesAgo(60) });
    await seedMedia({ workspaceId, textExtractionStatus: null, createdAt: minutesAgo(60) });

    await mediaTextExtractionSweepProcessor();

    expect(queueAddBulkMock).toHaveBeenCalledTimes(1);
    const jobs = queueAddBulkMock.mock.calls[0]?.[0] ?? [];
    expect(jobs.map((job) => job.name)).toEqual([EXTRACT_MEDIA_TEXT_JOB, EXTRACT_MEDIA_TEXT_JOB]);
    expect(new Set(jobs.map((job) => job.data))).toEqual(
      new Set([{ mediaId: stale.id }, { mediaId: alsoStale.id }]),
    );
    expect(new Set(jobs.map((job) => (job.opts as { jobId: string }).jobId))).toEqual(
      new Set([stale.id, alsoStale.id]),
    );
  });

  test('queues nothing when no row is waiting', async () => {
    await mediaTextExtractionSweepProcessor();

    expect(queueAddBulkMock).not.toHaveBeenCalled();
  });
});
