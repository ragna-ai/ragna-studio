import { config } from '@repo/config';
import { failStaleRuns, failStaleTaskRuns } from '@repo/database';
import { logger } from '@repo/logger';
import { commentOnStaleTaskRuns } from '../task-runs/task-run.service';

const PENDING_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const RUNNING_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const STALE_TASK_RUN_QUEUED_MS = 60 * 60 * 1000; // 1 hour
const STALE_TASK_RUN_GRACE_MS = 15 * 60 * 1000; // after the time limit

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

// A run still `running` after its time limit plus a grace period lost its worker. The failure
// comment tells the user, and the task goes back to its previous status.
export async function staleTaskRunsProcessor() {
  logger.info('Running stale task run sweeper');

  const now = Date.now();
  const staleRuns = await failStaleTaskRuns({
    queuedBefore: new Date(now - STALE_TASK_RUN_QUEUED_MS),
    runningBefore: new Date(
      now - (config.taskRunTimeLimitMinutes * 60_000 + STALE_TASK_RUN_GRACE_MS),
    ),
  });

  await commentOnStaleTaskRuns(staleRuns);

  logger.info(`Stale task run sweeper marked ${staleRuns.length} run(s) as failed`);
}
