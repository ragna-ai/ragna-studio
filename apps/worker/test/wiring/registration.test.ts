import { config } from '@repo/config';
import {
  AGENT_CONTEXT_DOCUMENTS_QUEUE,
  EMAIL_CLASSIFY_QUEUE,
  EMAIL_DRAFT_QUEUE,
  EMAIL_SYNC_QUEUE,
  EMAILS_QUEUE,
  GEN_IMAGES_QUEUE,
  GEN_VIDEOS_QUEUE,
  NOTIFICATIONS_QUEUE,
  PURGE_QUEUE,
  WORKFLOW_SCHEDULES_QUEUE,
  WORKFLOWS_QUEUE,
} from '@repo/queue';
import { recordedCronJobs, recordedWorkers, resetProviderMocks } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { registerCronJobs } from '../../src/crons';
import { registerJobProcessors } from '../../src/processors';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

interface ExpectedWorker {
  queue: string;
  opts: { concurrency?: number; lockDuration?: number } | undefined;
}

const expectedWorkers: ExpectedWorker[] = [
  { queue: NOTIFICATIONS_QUEUE, opts: undefined },
  { queue: EMAILS_QUEUE, opts: undefined },
  { queue: WORKFLOWS_QUEUE, opts: { lockDuration: TEN_MINUTES_MS } },
  { queue: WORKFLOW_SCHEDULES_QUEUE, opts: undefined },
  { queue: AGENT_CONTEXT_DOCUMENTS_QUEUE, opts: undefined },
  { queue: GEN_VIDEOS_QUEUE, opts: { concurrency: 2, lockDuration: TEN_MINUTES_MS } },
  { queue: GEN_IMAGES_QUEUE, opts: { concurrency: 2, lockDuration: FIVE_MINUTES_MS } },
  { queue: EMAIL_SYNC_QUEUE, opts: { concurrency: 5, lockDuration: TEN_MINUTES_MS } },
  { queue: EMAIL_CLASSIFY_QUEUE, opts: { concurrency: 10 } },
  { queue: EMAIL_DRAFT_QUEUE, opts: { concurrency: 3, lockDuration: TEN_MINUTES_MS } },
  { queue: PURGE_QUEUE, opts: undefined },
];

const expectedCrons = [
  { name: 'cleanup', schedule: { pattern: '0 2 * * *' } },
  { name: 'stale-workflow-runs', schedule: { pattern: '*/15 * * * *' } },
  { name: 'task-reminder', schedule: { pattern: '* * * * *' } },
  { name: 'media-sweep', schedule: { pattern: '0 * * * *' } },
  { name: 'email-sync', schedule: { every: config.emailSyncInterval } },
  { name: 'purge', schedule: { pattern: '0 3 * * *' } },
];

describe('registerJobProcessors', () => {
  beforeEach(() => {
    resetProviderMocks();
  });

  test('registers one worker per queue with its concurrency and lock duration', () => {
    registerJobProcessors();

    expect(recordedWorkers).toHaveLength(expectedWorkers.length);
    for (const expected of expectedWorkers) {
      const worker = recordedWorkers.find((recorded) => recorded.name === expected.queue);
      expect(worker?.opts).toEqual(expected.opts);
      expect(typeof worker?.processor).toBe('function');
    }
  });
});

describe('registerCronJobs', () => {
  beforeEach(() => {
    resetProviderMocks();
  });

  test('registers every cron with its schedule', () => {
    registerCronJobs();

    expect(recordedCronJobs).toHaveLength(expectedCrons.length);
    for (const expected of expectedCrons) {
      const cron = recordedCronJobs.find((recorded) => recorded.name === expected.name);
      expect(cron?.schedule).toEqual(expected.schedule);
      expect(typeof cron?.processor).toBe('function');
    }
  });
});
