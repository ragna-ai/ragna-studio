import {
  deleteExpiredSessions,
  deleteExpiredVerifications,
  deleteReadNotificationsOlderThan,
} from '@repo/database';
import { logger } from '@repo/logger';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// better-auth only removes expired sessions lazily on lookup and never
// sweeps verification rows at all, so both tables grow unbounded. Each step
// runs independently: a failure in one sweep must not skip the other.
export async function cleanupProcessor() {
  logger.info('Running cleanup cron job');

  await runCleanupStep('expired sessions', deleteExpiredSessions);
  await runCleanupStep('expired verifications', deleteExpiredVerifications);

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
  await runCleanupStep('read notifications', () =>
    deleteReadNotificationsOlderThan({ date: thirtyDaysAgo }),
  );

  logger.info('Cleanup cron job completed');
}

async function runCleanupStep(label: string, deleteFn: () => Promise<number>) {
  try {
    const deletedCount = await deleteFn();
    logger.info(`Deleted ${deletedCount} ${label}`);
  } catch (error) {
    logger.error(`Failed to delete ${label}`, error);
  }
}
