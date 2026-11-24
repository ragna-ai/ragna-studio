import { config } from '@repo/config';
import {
  failStaleRuns,
  failStaleTaskRuns,
  failTaskRunsByIds,
  listStaleQueuedTaskRuns,
  STALE_TASK_RUN_ERROR,
} from '@repo/database';
import { logger } from '@repo/logger';
import { queue } from '@repo/queue';
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

// A queued run waits for a worker, so age alone does not fail it. Only a run whose job is gone or
// ended without starting it is stuck. Checking is one Redis call per run, so a sweep looks at
// the oldest few.
const STALE_QUEUED_CHECK_LIMIT = 50;
const LIVE_JOB_STATES: ReadonlySet<string> = new Set([
  'waiting',
  'delayed',
  'active',
  'prioritized',
  'waiting-children',
]);

async function findQueuedRunsWithoutLiveJob(): Promise<string[]> {
  const candidates = await listStaleQueuedTaskRuns({
    queuedBefore: new Date(Date.now() - STALE_TASK_RUN_QUEUED_MS),
    limit: STALE_QUEUED_CHECK_LIMIT,
  });
  const states = await Promise.all(candidates.map((run) => queue.taskRun().getJobState(run.id)));
  return candidates
    .filter((_, index) => !LIVE_JOB_STATES.has(states[index] ?? ''))
    .map((run) => run.id);
}

// A run still `running` after its time limit plus a grace period lost its worker. The failure
// comment tells the user, and the task goes back to its previous status.
export async function staleTaskRunsProcessor() {
  logger.info('Running stale task run sweeper');

  const lostRuns = await failStaleTaskRuns({
    runningBefore: new Date(
      Date.now() - (config.taskRunTimeLimitMinutes * 60_000 + STALE_TASK_RUN_GRACE_MS),
    ),
  });
  const orphanedRuns = await failTaskRunsByIds({
    taskRunIds: await findQueuedRunsWithoutLiveJob(),
    error: STALE_TASK_RUN_ERROR,
  });
  const failedRuns = [...lostRuns, ...orphanedRuns];

  await commentOnStaleTaskRuns(failedRuns);

  logger.info(`Stale task run sweeper marked ${failedRuns.length} run(s) as failed`);
}
