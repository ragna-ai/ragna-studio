// apps/api/test/email/support/email-queue.mock.ts
//
// packages/testing/src/mocks/queue-provider.mock.ts predates the three
// email queues (EMAIL_SYNC_QUEUE / EMAIL_CLASSIFY_QUEUE / EMAIL_DRAFT_QUEUE,
// packages/queue/src/queues/index.ts): its fake `queue` object only has
// `email`/`onboarding`/`notification`/`workflow`/`agentContextDocument`/
// `genVideo`/`genImages` factories. email.service.ts's `queue.emailSync()`,
// `queue.emailDraft()`, etc. throw "queue.emailSync is not a function"
// against that mock as-is - reported to team-lead as a packages/testing gap
// (out of this suite's ownership, apps/api/test/** only, no packages/*
// edits). This file plugs the gap locally, purely additive (every existing
// queue name keeps resolving to the original shared queueAddMock from
// @repo/testing), using the exact mechanism apps/api/test/preload.ts
// already uses for '@repo/linkedin'/'@repo/queue': one more
// `mock.module('@repo/queue', ...)` call, registered from a file inside
// apps/api itself. Since preload.ts always runs before any test file (bunfig
// .toml's `[test].preload`) and this file is only ever imported by this
// domain's test files (which import after preload has run), this
// registration always lands last and wins for the rest of the `bun test`
// process.
//
// Jobs added with a `jobId` approximate BullMQ's own dedupe rule (queues/
// index.ts's comment: "re-adding with the same jobId is a no-op while a job
// with that id still exists in Redis, complete or failed"): a second add()
// with a jobId already pending does not grow the pending set, so a test can
// assert "still exactly one job" instead of only re-checking the call
// count. `completeEmailQueueJob` frees a jobId back up, for a test proving
// a *third* trigger after the in-flight one "finishes" enqueues again.
import { EMAIL_CLASSIFY_QUEUE, EMAIL_DRAFT_QUEUE, EMAIL_SYNC_QUEUE } from '@repo/queue';
import { queueModuleMock } from '@repo/testing';
import { mock } from 'bun:test';

interface FakeJob {
  id: string;
  name: string;
}

interface FakeAddOptions {
  jobId?: string;
}

const pendingJobIdsByQueue = new Map<string, Set<string>>();

function emailQueueAddImpl(queueName: string) {
  return (jobName: string, _data: unknown, opts?: FakeAddOptions): Promise<FakeJob> => {
    const jobId = opts?.jobId;

    if (jobId === undefined) {
      return Promise.resolve({ id: `test-job-${crypto.randomUUID()}`, name: jobName });
    }

    const pending = pendingJobIdsByQueue.get(queueName) ?? new Set<string>();
    pending.add(jobId);
    pendingJobIdsByQueue.set(queueName, pending);

    return Promise.resolve({ id: jobId, name: jobName });
  };
}

export const emailSyncAddMock = mock(emailQueueAddImpl(EMAIL_SYNC_QUEUE));
export const emailClassifyAddMock = mock(emailQueueAddImpl(EMAIL_CLASSIFY_QUEUE));
export const emailDraftAddMock = mock(emailQueueAddImpl(EMAIL_DRAFT_QUEUE));

/** Distinct jobIds currently "pending" for a queue - this fake's stand-in for real queue depth. */
export function getPendingEmailJobCount(queueName: string): number {
  return pendingJobIdsByQueue.get(queueName)?.size ?? 0;
}

/** Simulates the worker finishing a job, freeing its jobId for a fresh add(). */
export function completeEmailQueueJob(queueName: string, jobId: string): void {
  pendingJobIdsByQueue.get(queueName)?.delete(jobId);
}

export function resetEmailQueueMock(): void {
  emailSyncAddMock.mockClear();
  emailClassifyAddMock.mockClear();
  emailDraftAddMock.mockClear();
  pendingJobIdsByQueue.clear();
}

function fakeEmailQueue(name: string, addMock: typeof emailSyncAddMock) {
  return { name, add: addMock };
}

export const emailQueueModuleMock = {
  ...queueModuleMock,
  queue: {
    ...queueModuleMock.queue,
    emailSync: () => fakeEmailQueue(EMAIL_SYNC_QUEUE, emailSyncAddMock),
    emailClassify: () => fakeEmailQueue(EMAIL_CLASSIFY_QUEUE, emailClassifyAddMock),
    emailDraft: () => fakeEmailQueue(EMAIL_DRAFT_QUEUE, emailDraftAddMock),
  },
};

mock.module('@repo/queue', () => emailQueueModuleMock);
