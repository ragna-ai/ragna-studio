import {
  createWorkflowRun,
  getWorkflowForScheduledRun,
  hasActiveRun,
  resolveScheduledRunUserId,
  updateRunStatus,
} from '@repo/database';
import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import {
  createWorker,
  queue,
  removeQueueJobScheduler,
  WORKFLOW_RUN_JOB,
  WORKFLOW_SCHEDULE_TICK_JOB,
  WORKFLOW_SCHEDULES_QUEUE,
  workflowRunJobSchema,
  workflowScheduleTickJobSchema,
} from '@repo/queue';

export function registerWorkflowScheduleJobProcessor(): Worker<any, any, string> {
  const scheduleWorker = createWorker({
    name: WORKFLOW_SCHEDULES_QUEUE,
    processor: async (job) => {
      logger.info(`Processing workflow schedule jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case WORKFLOW_SCHEDULE_TICK_JOB: {
          const { workflowId } = workflowScheduleTickJobSchema.parse(job.data);
          await processScheduleTick({ workflowId });
          break;
        }
        default: {
          throw new Error(`Unknown workflow schedule job: ${job.name}`);
        }
      }

      logger.info(`Completed workflow schedule jobId: ${job.id} name: ${job.name}`);
    },
  });

  scheduleWorker.on('ready', () => {
    logger.info('Workflow schedule processor is ready and listening for jobs');
  });

  return scheduleWorker;
}

// Mirrors the manual run endpoint (POST /workflow/:workflowId/run): creates a
// run row from the published definition and enqueues the existing run job.
// The engine itself is untouched, a scheduled run is just another way to
// create a workflow_runs row.
async function processScheduleTick({ workflowId }: { workflowId: string }): Promise<void> {
  const workflow = await getWorkflowForScheduledRun({ workflowId });

  // Orphan guard: the workflow was deleted, or no longer carries a schedule
  // (republished manual, or a scheduler that survived a failed publish
  // sync). Removing the scheduler here self-heals both cases without manual
  // intervention (workflows-scheduling.md, decision 8).
  if (!workflow || !workflow.scheduleCron || !workflow.publishedDefinition) {
    logger.info(`Workflow ${workflowId} has no active schedule, removing its job scheduler`);
    await removeQueueJobScheduler({
      queueName: WORKFLOW_SCHEDULES_QUEUE,
      schedulerId: workflowId,
    });
    return;
  }

  // Overlap guard (decision 5): skip rather than stack. A crashed/stuck run
  // is bounded by the stale-run sweeper, not retried here.
  if (await hasActiveRun({ workflowId })) {
    logger.info(`Workflow ${workflowId} already has an active run, skipping this tick`);
    return;
  }

  const run = await createWorkflowRun({
    workflowId,
    definition: workflow.publishedDefinition,
    triggeredBy: 'schedule',
    triggeredByUserId: await resolveScheduledRunUserId({ workflowId }),
  });

  try {
    await queue.workflow().add(WORKFLOW_RUN_JOB, workflowRunJobSchema.parse({ runId: run.id }), {
      attempts: 3,
    });
  } catch (error) {
    logger.error(`Failed to enqueue scheduled workflow run ${run.id}:`, error);

    // Best-effort: the run row would otherwise stay 'pending' forever with
    // no job behind it (e.g. Redis is down), mirroring the run endpoint's
    // fail-fast enqueue handling.
    try {
      await updateRunStatus({
        runId: run.id,
        status: 'failed',
        error: 'Failed to enqueue workflow run',
        finishedAt: new Date(),
      });
    } catch (markError) {
      logger.error(`Failed to mark scheduled workflow run ${run.id} as failed:`, markError);
    }

    throw error;
  }
}
