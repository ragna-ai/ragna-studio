import { getRunForExecution, getRunStatus, updateRunStatus } from '@repo/database';
import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import {
  createWorker,
  enqueueNotification,
  WORKFLOW_RUN_JOB,
  WorkflowRunJobDto,
  WORKFLOWS_QUEUE,
} from '@repo/queue';
import type { WorkflowRunStatus } from '@repo/workflow';
import { executeWorkflowRun } from '../workflow/engine';

const TERMINAL_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

// A workflow's team/agent node can now call the video-gen tool with
// awaitGeneration: true (docs/videogen/prd.md decision 2), which blocks the
// run inline on a 1-6 minute Veo render. The default 30s lock would let
// BullMQ's stalled checker reclaim the job mid-render, so it is stretched
// the same way as the gen-videos worker (gen-video.processor.ts).
const LOCK_DURATION_MS = 10 * 60 * 1000;

export function registerWorkflowJobProcessor(): Worker<any, any, string> {
  const workflowWorker = createWorker({
    name: WORKFLOWS_QUEUE,
    opts: {
      lockDuration: LOCK_DURATION_MS,
    },
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
            await notifyRunFinished({ runId });
          } catch (error) {
            const attempts = job.opts.attempts ?? 1;
            const isFinalAttempt = job.attemptsMade + 1 >= attempts;

            if (isFinalAttempt) {
              // Mark failed first so notifyRunFinished reads status 'failed'
              // and sends 'workflow_run_failed'.
              await markRunFailedBestEffort({ runId, error });
              await notifyRunFinished({ runId });
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

async function notifyRunFinished({ runId }: { runId: string }): Promise<void> {
  try {
    const run = await getRunForExecution({ runId });
    if (!run) {
      logger.error(`Workflow run ${runId} not found, skipping notification`);
      return;
    }

    const { userId } = run.workflow;
    const data = {
      workflowId: run.workflowId,
      runId: run.id,
      workflowName: run.workflow.name,
      workspaceId: run.workflow.workspaceId,
    };

    switch (run.status) {
      case 'completed':
        await enqueueNotification({ userId, type: 'workflow_run_succeeded', data });
        break;
      case 'failed':
        await enqueueNotification({ userId, type: 'workflow_run_failed', data });
        break;
      default:
        // 'cancelled' (and any other non-notifying status): a user who
        // cancelled a run already knows, so nothing to send.
        logger.info(`Workflow run ${runId} has no notification type, skipping notification`);
    }
  } catch (error) {
    logger.error(`Failed to enqueue notification for workflow run ${runId}:`, error);
  }
}
