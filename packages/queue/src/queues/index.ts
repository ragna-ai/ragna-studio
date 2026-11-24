import {
  AGENT_CONTEXT_DOCUMENTS_QUEUE,
  AGENT_IMAGE_QUEUE,
  EMAIL_CLASSIFY_QUEUE,
  EMAIL_DRAFT_QUEUE,
  EMAIL_SYNC_QUEUE,
  EMAILS_QUEUE,
  GEN_IMAGES_QUEUE,
  GEN_VIDEOS_QUEUE,
  MEDIA_TEXT_EXTRACTION_QUEUE,
  NOTIFICATIONS_QUEUE,
  ONBOARDINGS_QUEUE,
  PURGE_QUEUE,
  TASK_RUNS_QUEUE,
  VISIBLE_WATERMARK_QUEUE,
  WORKFLOWS_QUEUE,
} from '../constants';
import type { QueueOptions } from 'bullmq';
import { getOrCreateQueue } from '../services/bullmq.service';

// Queues whose jobs use a custom jobId (email accounts, media ids): re-adding a job whose id
// still exists in Redis, complete or failed, is a no-op, so a kept failed job wedges every retry.
const dedupedJobQueueOpts: Omit<QueueOptions, 'connection'> = {
  defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
};

// A retry repeats the whole run, so the worker only lets BullMQ retry one that has not written yet.
const taskRunQueueOpts: Omit<QueueOptions, 'connection'> = {
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
};

/**
 * Factory for creating or retrieving queues. Use the returned queue to add jobs, e.g.:
 *   queue.workflow().add('my-job', { foo: 'bar' });
 */
export const queue = {
  email: () => getOrCreateQueue({ name: EMAILS_QUEUE }),
  onboarding: () => getOrCreateQueue({ name: ONBOARDINGS_QUEUE }),
  notification: () => getOrCreateQueue({ name: NOTIFICATIONS_QUEUE }),
  workflow: () => getOrCreateQueue({ name: WORKFLOWS_QUEUE }),
  agentContextDocument: () => getOrCreateQueue({ name: AGENT_CONTEXT_DOCUMENTS_QUEUE }),
  agentImage: () => getOrCreateQueue({ name: AGENT_IMAGE_QUEUE }),
  genVideo: () => getOrCreateQueue({ name: GEN_VIDEOS_QUEUE }),
  genImages: () => getOrCreateQueue({ name: GEN_IMAGES_QUEUE }),
  emailSync: () => getOrCreateQueue({ name: EMAIL_SYNC_QUEUE, opts: dedupedJobQueueOpts }),
  emailClassify: () => getOrCreateQueue({ name: EMAIL_CLASSIFY_QUEUE, opts: dedupedJobQueueOpts }),
  emailDraft: () => getOrCreateQueue({ name: EMAIL_DRAFT_QUEUE, opts: dedupedJobQueueOpts }),
  purge: () => getOrCreateQueue({ name: PURGE_QUEUE }),
  mediaTextExtraction: () =>
    getOrCreateQueue({ name: MEDIA_TEXT_EXTRACTION_QUEUE, opts: dedupedJobQueueOpts }),
  visibleWatermark: () => getOrCreateQueue({ name: VISIBLE_WATERMARK_QUEUE }),
  taskRun: () => getOrCreateQueue({ name: TASK_RUNS_QUEUE, opts: taskRunQueueOpts }),
} as const;
