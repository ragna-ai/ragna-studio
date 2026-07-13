import {
  EMAILS_QUEUE,
  NOTIFICATIONS_QUEUE,
  ONBOARDINGS_QUEUE,
  WORKFLOWS_QUEUE,
} from '../constants';
import { getOrCreateQueue } from '../services/bullmq.service';

export const queue = {
  email: () => getOrCreateQueue({ name: EMAILS_QUEUE }),
  onboarding: () => getOrCreateQueue({ name: ONBOARDINGS_QUEUE }),
  notification: () => getOrCreateQueue({ name: NOTIFICATIONS_QUEUE }),
  workflow: () => getOrCreateQueue({ name: WORKFLOWS_QUEUE }),
} as const;
