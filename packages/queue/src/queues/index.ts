import {
  AGENT_CONTEXT_DOCUMENTS_QUEUE,
  EMAILS_QUEUE,
  GEN_VIDEOS_QUEUE,
  NOTIFICATIONS_QUEUE,
  ONBOARDINGS_QUEUE,
  WORKFLOWS_QUEUE,
} from '../constants';
import { getOrCreateQueue } from '../services/bullmq.service';

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
} as const;
