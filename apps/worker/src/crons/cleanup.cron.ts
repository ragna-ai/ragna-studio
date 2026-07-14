import { deleteExpiredSessions, deleteExpiredVerifications } from '@repo/database';
import { logger } from '@repo/logger';

// better-auth only removes expired sessions lazily on lookup and never
// sweeps verification rows at all, so both tables grow unbounded. Each step
// runs independently: a failure in one sweep must not skip the other.
export async function cleanupProcessor() {
  logger.info('Running cleanup cron job');

  await runCleanupStep('expired sessions', deleteExpiredSessions);
  await runCleanupStep('expired verifications', deleteExpiredVerifications);

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
