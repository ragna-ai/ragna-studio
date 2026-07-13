import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import { createWorker, WORKFLOW_RUN_JOB, WorkflowRunJobDto, WORKFLOWS_QUEUE } from '@repo/queue';
import { executeWorkflowRun } from '../workflow/engine';

export function registerWorkflowJobProcessor(): Worker<any, any, string> {
  const workflowWorker = createWorker({
    name: WORKFLOWS_QUEUE,
    processor: async (job) => {
      logger.info(`Processing workflow jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case WORKFLOW_RUN_JOB: {
          const { runId } = WorkflowRunJobDto.fromJSON(job.data);
          await executeWorkflowRun({ runId });
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
