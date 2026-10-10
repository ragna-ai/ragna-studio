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
// apps/worker's suite keeps the queue mocked too: it asserts what each
// register call hands `createWorker` / `addCronJob`, and calls handlers
// directly instead of running a real BullMQ worker.
import * as queuePackage from '@repo/queue';
import { mock } from 'bun:test';

type FakeJob = { id: string; name: string };

function defaultQueueAddImpl(jobName: string): Promise<FakeJob> {
  return Promise.resolve({ id: `test-job-${crypto.randomUUID()}`, name: jobName });
}

export const queueAddMock =
  mock<(jobName: string, data: unknown, opts?: any) => Promise<FakeJob>>(defaultQueueAddImpl);

export interface FakeBulkJob {
  name: string;
  data: unknown;
  opts?: unknown;
}

export const queueAddBulkMock = mock((jobs: FakeBulkJob[]) =>
  Promise.all(jobs.map((job) => defaultQueueAddImpl(job.name))),
);

function fakeQueue(name: string) {
  return { name, add: queueAddMock, addBulk: queueAddBulkMock };
}

export const upsertQueueJobSchedulerMock = mock(() => Promise.resolve({} as any));
export const removeQueueJobSchedulerMock = mock(() => Promise.resolve(true));
export const getQueueJobSchedulersMock = mock(() => Promise.resolve([] as any[]));

type CreateWorkerParams = Parameters<typeof queuePackage.createWorker>[0];
type AddCronJobParams = Parameters<typeof queuePackage.addCronJob>[0];

export interface RecordedWorker {
  name: CreateWorkerParams['name'];
  opts: CreateWorkerParams['opts'];
  processor: CreateWorkerParams['processor'];
}

export const recordedWorkers: RecordedWorker[] = [];
export const recordedCronJobs: AddCronJobParams[] = [];

export const createWorkerMock = mock((params: CreateWorkerParams) => {
  recordedWorkers.push({ name: params.name, opts: params.opts, processor: params.processor });
  return { name: params.name, on: () => undefined } as unknown as ReturnType<
    typeof queuePackage.createWorker
  >;
});

export const addCronJobMock = mock((params: AddCronJobParams) => {
  recordedCronJobs.push(params);
});

export function resetQueueMock(): void {
  recordedWorkers.length = 0;
  recordedCronJobs.length = 0;
  createWorkerMock.mockClear();
  addCronJobMock.mockClear();
  queueAddMock.mockClear();
  queueAddMock.mockImplementation(defaultQueueAddImpl);
  queueAddBulkMock.mockClear();
  upsertQueueJobSchedulerMock.mockClear();
  removeQueueJobSchedulerMock.mockClear();
  getQueueJobSchedulersMock.mockClear();
}

// Overrides for the real @repo/queue exports we replace below. Named
// explicitly (rather than left to inference) so TS never has to expand and
// print @repo/queue's own bullmq-typed exports (Queue, Job, FlowProducer,
// ...): packages/testing doesn't depend on bullmq directly, and those types
// live in a nested copy under packages/queue/node_modules that TS can't name
// via a portable import from here (TS2883). Referencing `typeof queuePackage`
// below reuses the existing `@repo/queue` import instead of triggering that
// expansion.
type QueueMockOverrides = {
  queue: {
    email: () => ReturnType<typeof fakeQueue>;
    onboarding: () => ReturnType<typeof fakeQueue>;
    notification: () => ReturnType<typeof fakeQueue>;
    workflow: () => ReturnType<typeof fakeQueue>;
    agentContextDocument: () => ReturnType<typeof fakeQueue>;
    genVideo: () => ReturnType<typeof fakeQueue>;
    genImages: () => ReturnType<typeof fakeQueue>;
    emailSync: () => ReturnType<typeof fakeQueue>;
    emailClassify: () => ReturnType<typeof fakeQueue>;
    emailDraft: () => ReturnType<typeof fakeQueue>;
    purge: () => ReturnType<typeof fakeQueue>;
  };
  upsertQueueJobScheduler: typeof upsertQueueJobSchedulerMock;
  removeQueueJobScheduler: typeof removeQueueJobSchedulerMock;
  getQueueJobSchedulers: typeof getQueueJobSchedulersMock;
  createWorker: typeof createWorkerMock;
  addCronJob: typeof addCronJobMock;
};

// Exported so apps/api's test preload can re-register it from the app's own
// resolution context, the same way linkedin-provider.mock.ts's
// `linkedinModuleMock` does: under injectWorkspacePackages, this file runs
// from a frozen copy in node_modules/.pnpm/, where '@repo/queue' resolves
// to a different path than the one apps/api (and @repo/ai) import.
export const queueModuleMock: Omit<typeof queuePackage, keyof QueueMockOverrides> &
  QueueMockOverrides = {
  ...queuePackage,
  queue: {
    email: () => fakeQueue(queuePackage.EMAILS_QUEUE),
    onboarding: () => fakeQueue(queuePackage.ONBOARDINGS_QUEUE),
    notification: () => fakeQueue(queuePackage.NOTIFICATIONS_QUEUE),
    workflow: () => fakeQueue(queuePackage.WORKFLOWS_QUEUE),
    agentContextDocument: () => fakeQueue(queuePackage.AGENT_CONTEXT_DOCUMENTS_QUEUE),
    genVideo: () => fakeQueue(queuePackage.GEN_VIDEOS_QUEUE),
    genImages: () => fakeQueue(queuePackage.GEN_IMAGES_QUEUE),
    emailSync: () => fakeQueue(queuePackage.EMAIL_SYNC_QUEUE),
    emailClassify: () => fakeQueue(queuePackage.EMAIL_CLASSIFY_QUEUE),
    emailDraft: () => fakeQueue(queuePackage.EMAIL_DRAFT_QUEUE),
    purge: () => fakeQueue(queuePackage.PURGE_QUEUE),
  },
  upsertQueueJobScheduler: upsertQueueJobSchedulerMock,
  removeQueueJobScheduler: removeQueueJobSchedulerMock,
  getQueueJobSchedulers: getQueueJobSchedulersMock,
  createWorker: createWorkerMock,
  addCronJob: addCronJobMock,
};

mock.module('@repo/queue', () => queueModuleMock);
