import { failStaleRuns } from '@repo/database';
import { logger } from '@repo/logger';

const PENDING_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const RUNNING_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

// Scheduled runs execute unattended, so a crashed worker or dropped job can
// otherwise leave a run stuck 'pending'/'running' forever, blocking that
// workflow's schedule under the overlap skip policy (workflows-scheduling.md,
// decision 10). `failStaleRuns` guards the terminal-status check in its SQL
// where-clause, so this never overwrites a run that finished in the meantime.
export async function staleRunsProcessor() {
  logger.info('Running stale workflow run sweeper');

  const now = Date.now();
  const failedCount = await failStaleRuns({
    pendingBefore: new Date(now - PENDING_TIMEOUT_MS),
    runningBefore: new Date(now - RUNNING_TIMEOUT_MS),
  });

  logger.info(`Stale workflow run sweeper marked ${failedCount} run(s) as failed`);
}
