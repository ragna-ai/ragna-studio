// packages/testing/src/mocks/queue-provider.mock.ts
//
// Mocks `@repo/queue`'s Redis-touching surface. Every apps/api call into it
// is fire-and-forget from the test's point of view (enqueue a job, sync a
// job scheduler); nothing in apps/api's own tests reads a job back off a
// real queue, so there's no reason to touch the shared docker Redis dev
// worker also consumes from. Without this, `bun test` would add real jobs
// to `workflows-queue`, `gen-images-queue`, etc. on the same Redis instance
// the local dev worker polls, either piling up unprocessed jobs there or
// having the dev worker actually try (and fail) to process rows that only
// exist in `studio_test`.
//
// `@repo/queue` stays external (not bundled) in `@repo/ai`'s tsdown output
// (`packages/ai/dist/index.mjs` imports it as a real `from "@repo/queue"`
// specifier), the same way the `ai` npm package stays external underneath
// it. So the registration below, re-applied from apps/api's own resolution
// context by `apps/api/test/preload.ts`, also covers `@repo/ai`'s own
// `queue.genImages()/.genVideo().add(...)` calls (imagen/videogen
// services), resolved through apps/api's own node_modules tree, not just
// apps/api's direct `@repo/queue` imports (workflow, agent-context-document).
//
// Constants and DTOs stay real via the spread below: they're pure, no I/O.
//
// apps/worker's future test suite is exactly where real queue/worker
// mechanics (a job actually being picked up and processed) belongs, so it
// should test against real BullMQ instead of importing this mock.
import { mock } from 'bun:test';
import * as queuePackage from '@repo/queue';
import type { JobSchedulerJson, JobsOptions } from 'bullmq';

type FakeJob = { id: string; name: string };

function defaultQueueAddImpl(jobName: string): Promise<FakeJob> {
  return Promise.resolve({ id: `test-job-${crypto.randomUUID()}`, name: jobName });
}

export const queueAddMock = mock<
  (jobName: string, data: unknown, opts?: JobsOptions) => Promise<FakeJob>
>(defaultQueueAddImpl);

function fakeQueue(name: string) {
  return { name, add: queueAddMock };
}

export const upsertQueueJobSchedulerMock = mock(() => Promise.resolve({} as JobSchedulerJson));
export const removeQueueJobSchedulerMock = mock(() => Promise.resolve(true));
export const getQueueJobSchedulersMock = mock(() => Promise.resolve([] as JobSchedulerJson[]));

export function resetQueueMock(): void {
  queueAddMock.mockClear();
  queueAddMock.mockImplementation(defaultQueueAddImpl);
  upsertQueueJobSchedulerMock.mockClear();
  removeQueueJobSchedulerMock.mockClear();
  getQueueJobSchedulersMock.mockClear();
}

// Exported so apps/api's test preload can re-register it from the app's own
// resolution context, the same way linkedin-provider.mock.ts's
// `linkedinModuleMock` does: under injectWorkspacePackages, this file runs
// from a frozen copy in node_modules/.pnpm/, where '@repo/queue' resolves
// to a different path than the one apps/api (and @repo/ai) import.
export const queueModuleMock = {
  ...queuePackage,
  queue: {
    email: () => fakeQueue(queuePackage.EMAILS_QUEUE),
    onboarding: () => fakeQueue(queuePackage.ONBOARDINGS_QUEUE),
    notification: () => fakeQueue(queuePackage.NOTIFICATIONS_QUEUE),
    workflow: () => fakeQueue(queuePackage.WORKFLOWS_QUEUE),
    agentContextDocument: () => fakeQueue(queuePackage.AGENT_CONTEXT_DOCUMENTS_QUEUE),
    genVideo: () => fakeQueue(queuePackage.GEN_VIDEOS_QUEUE),
    genImages: () => fakeQueue(queuePackage.GEN_IMAGES_QUEUE),
  },
  upsertQueueJobScheduler: upsertQueueJobSchedulerMock,
  removeQueueJobScheduler: removeQueueJobSchedulerMock,
  getQueueJobSchedulers: getQueueJobSchedulersMock,
};

mock.module('@repo/queue', () => queueModuleMock);
