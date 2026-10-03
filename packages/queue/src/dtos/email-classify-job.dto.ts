import { z } from 'zod';

// Enqueued by email-sync for every new message (docs/email/prd.md, "Worker
// jobs"): fetches the body, persists it, classifies with the account's
// category set, and enqueues email-draft when auto-draft applies.
export const emailClassifyJobSchema = z.object({
  accountId: z.uuidv7(),
  messageId: z.uuidv7(),
});

export type EmailClassifyJobData = z.infer<typeof emailClassifyJobSchema>;

export const EMAIL_CLASSIFY_JOB = 'email-classify-job';
