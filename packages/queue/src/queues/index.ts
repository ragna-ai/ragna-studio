import {
  AGENTS_QUEUE,
  EMAIL_QUEUE,
  NOTIFICATION_QUEUE,
  ONBOARDING_QUEUE,
  POSTS_QUEUE,
  SOCIAL_ACCOUNT_QUEUE,
  WORKFLOWS_QUEUE,
} from '../constants';
import { getOrCreateQueue } from '../services/bullmq.service';

export const queue = {
  email: () => getOrCreateQueue({ name: EMAIL_QUEUE }),
  onboarding: () => getOrCreateQueue({ name: ONBOARDING_QUEUE }),
  notification: () => getOrCreateQueue({ name: NOTIFICATION_QUEUE }),
  post: () => getOrCreateQueue({ name: POSTS_QUEUE }),
  agent: () => getOrCreateQueue({ name: AGENTS_QUEUE }),
  socialAccount: () => getOrCreateQueue({ name: SOCIAL_ACCOUNT_QUEUE }),
  workflow: () => getOrCreateQueue({ name: WORKFLOWS_QUEUE }),
} as const;
