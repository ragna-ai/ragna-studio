import { listEmailAccountsDueForSync } from '@repo/database';
import { logger } from '@repo/logger';
import { EMAIL_SYNC_JOB, emailSyncJobSchema, queue } from '@repo/queue';

// Fans out one email-sync job per connected account still due for syncing
// (specs/email/prd.md, "Worker jobs"; listEmailAccountsDueForSync excludes
// accounts flagged reauth_required, whose credentials are known dead until
// the user reconnects). accountId doubles as the BullMQ jobId: adding a job
// with an id that's already waiting/active is a no-op (bullmq.service.ts's
// createQueue/createWorker don't dedupe themselves, this relies on BullMQ's
// own jobId semantics), so a still-running sync from the previous tick
// never gets a second job stacked behind it.
export async function emailSyncCronProcessor(): Promise<void> {
  const accounts = await listEmailAccountsDueForSync();

  for (const account of accounts) {
    await queue
      .emailSync()
      .add(EMAIL_SYNC_JOB, emailSyncJobSchema.parse({ accountId: account.id }), {
        jobId: account.id,
      });
  }

  logger.debug(`Email sync cron fanned out ${accounts.length} account sync job(s)`);
}
