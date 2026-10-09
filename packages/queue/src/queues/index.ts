import {
  AGENT_CONTEXT_DOCUMENTS_QUEUE,
  EMAIL_CLASSIFY_QUEUE,
  EMAIL_DRAFT_QUEUE,
  EMAIL_SYNC_QUEUE,
  EMAILS_QUEUE,
  GEN_IMAGES_QUEUE,
  GEN_VIDEOS_QUEUE,
  NOTIFICATIONS_QUEUE,
  ONBOARDINGS_QUEUE,
  PURGE_QUEUE,
  WORKFLOWS_QUEUE,
} from '../constants';
import type { QueueOptions } from 'bullmq';
import { getOrCreateQueue } from '../services/bullmq.service';

// email-sync jobs are deduped on a custom jobId (the accountId, see
// apps/api/src/services/email.service.ts and apps/worker/src/crons/
// email-sync.cron.ts): re-adding with the same jobId is a no-op while a job
// with that id still exists in Redis, complete or failed. Without eager
// retention, a single failed sync permanently wedges that account's cron
// tick and manual "Sync now" (production incident). The
// worker already logs failures, so nothing is lost by not keeping the job
// record; applies to all three email queues since classify/draft feed off
// the same pipeline and share the failure mode.
const emailQueueOpts: Omit<QueueOptions, 'connection'> = {
  defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
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
  genVideo: () => getOrCreateQueue({ name: GEN_VIDEOS_QUEUE }),
  genImages: () => getOrCreateQueue({ name: GEN_IMAGES_QUEUE }),
  emailSync: () => getOrCreateQueue({ name: EMAIL_SYNC_QUEUE, opts: emailQueueOpts }),
  emailClassify: () => getOrCreateQueue({ name: EMAIL_CLASSIFY_QUEUE, opts: emailQueueOpts }),
  emailDraft: () => getOrCreateQueue({ name: EMAIL_DRAFT_QUEUE, opts: emailQueueOpts }),
  purge: () => getOrCreateQueue({ name: PURGE_QUEUE }),
} as const;
