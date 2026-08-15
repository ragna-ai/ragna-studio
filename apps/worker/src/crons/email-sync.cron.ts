import { listEmailAccounts } from '@repo/database';
import { logger } from '@repo/logger';
import { EMAIL_SYNC_JOB, EmailSyncJobDto, queue } from '@repo/queue';

// Fans out one email-sync job per connected account (docs/email/prd.md,
// "Worker jobs"). accountId doubles as the BullMQ jobId: adding a job with
// an id that's already waiting/active is a no-op (bullmq.service.ts's
// createQueue/createWorker don't dedupe themselves, this relies on BullMQ's
// own jobId semantics), so a still-running sync from the previous tick
// never gets a second job stacked behind it.
export async function emailSyncCronProcessor(): Promise<void> {
  const accounts = await listEmailAccounts();

  for (const account of accounts) {
    await queue
      .emailSync()
      .add(EMAIL_SYNC_JOB, new EmailSyncJobDto({ accountId: account.id }).toJSON(), {
        jobId: account.id,
      });
  }

  logger.debug(`Email sync cron fanned out ${accounts.length} account sync job(s)`);
}
