import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import { createWorker, EMAIL_SYNC_JOB, EMAIL_SYNC_QUEUE, emailSyncJobSchema } from '@repo/queue';
import { syncEmailAccount } from '../mail/email-sync.service';

// The seed import (~50 threads, each a separate Gmail fetch) can take a
// while on first connect, so the lock is stretched well past BullMQ's 30s
// default, same reasoning as gen-images/gen-video's LOCK_DURATION_MS.
const LOCK_DURATION_MS = 10 * 60 * 1000;

export function registerEmailSyncJobProcessor(): Worker<any, any, string> {
  const emailSyncWorker = createWorker({
    name: EMAIL_SYNC_QUEUE,
    processor: async (job) => {
      logger.info(`Processing email-sync jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case EMAIL_SYNC_JOB: {
          const { accountId } = emailSyncJobSchema.parse(job.data);
          await syncEmailAccount(accountId);
          break;
        }
        default: {
          throw new Error(`Unknown email-sync job: ${job.name}`);
        }
      }

      logger.info(`Completed email-sync jobId: ${job.id} name: ${job.name}`);
      return { success: true };
    },
    opts: {
      // Several accounts can poll in parallel; each account's own jobs
      // still serialize via the cron's per-account jobId (email-sync.cron.ts).
      concurrency: 5,
      lockDuration: LOCK_DURATION_MS,
    },
  });

  emailSyncWorker.on('ready', () => {
    logger.info('Email-sync processor is ready and listening for jobs');
  });

  return emailSyncWorker;
}
