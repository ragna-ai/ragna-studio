import { z } from 'zod';

// Cron fans out one job per connected account (docs/email/prd.md, "Worker
// jobs"). The job reads the account's stored syncCursor off the DB rather
// than carrying it in the payload, same reasoning as gen-images-job.dto.ts's
// id-list payload.
export const emailSyncJobSchema = z.object({
  accountId: z.uuidv7(),
});

export type EmailSyncJobData = z.infer<typeof emailSyncJobSchema>;

export const EMAIL_SYNC_JOB = 'email-sync-job';
