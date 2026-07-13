import { getRunStatus, updateRunStatus } from '@repo/database';
import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import { createWorker, WORKFLOW_RUN_JOB, WorkflowRunJobDto, WORKFLOWS_QUEUE } from '@repo/queue';
import type { WorkflowRunStatus } from '@repo/workflow';
import { executeWorkflowRun } from '../workflow/engine';

const TERMINAL_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export function registerWorkflowJobProcessor(): Worker<any, any, string> {
  const workflowWorker = createWorker({
    name: WORKFLOWS_QUEUE,
    processor: async (job) => {
      logger.info(`Processing workflow jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case WORKFLOW_RUN_JOB: {
          const { runId } = WorkflowRunJobDto.fromJSON(job.data);

          // The engine only records step-level failures and rethrows,
          // leaving the run 'running' so a BullMQ retry can resume it. This
          // processor owns terminal run failure: once the current attempt is
          // the job's last one, mark the run 'failed' so it doesn't stay
          // stuck. BullMQ increments `job.attemptsMade` only after this call
          // returns/throws, so here it still reflects prior attempts only;
          // the current attempt is final when `attemptsMade + 1 >= attempts`
          // (mirrors BullMQ's own `shouldRetryJob` check).
          try {
            await executeWorkflowRun({ runId });
          } catch (error) {
            const attempts = job.opts.attempts ?? 1;
            const isFinalAttempt = job.attemptsMade + 1 >= attempts;

            if (isFinalAttempt) {
              await markRunFailedBestEffort({ runId, error });
            }

            throw error;
          }
          break;
        }
        default: {
          throw new Error(`Unknown workflow job: ${job.name}`);
        }
      }

      logger.info(`Completed workflow jobId: ${job.id} name: ${job.name}`);
      return { success: true };
    },
  });

  workflowWorker.on('ready', () => {
    logger.info('Workflow processor is ready and listening for jobs');
  });

  return workflowWorker;
}

// Best-effort: never let a failure here mask the original job error. Guards
// against overwriting a run that already reached a terminal status (e.g. the
// engine already completed it, or it was cancelled mid-flight).
async function markRunFailedBestEffort({
  runId,
  error,
}: {
  runId: string;
  error: unknown;
}): Promise<void> {
  try {
    const status = await getRunStatus({ runId });
    if (status && TERMINAL_RUN_STATUSES.has(status)) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    await updateRunStatus({ runId, status: 'failed', error: message, finishedAt: new Date() });
  } catch (markError) {
    logger.error(`Failed to mark workflow run ${runId} as failed after final attempt:`, markError);
  }
}
