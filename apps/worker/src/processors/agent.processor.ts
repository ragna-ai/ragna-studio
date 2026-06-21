import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import { AGENTS_QUEUE, createWorker } from '@repo/queue';

export function registerAgentJobProcessor(): Worker<any, any, string> {
  const agentWorker = createWorker({
    name: AGENTS_QUEUE,
    processor: async (job) => {
      logger.info(`Processing agent jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case 'AGENT_TASK_JOB': {
          const { agentId, task } = job.data as {
            agentId: string;
            task: string;
          };
          logger.debug(
            `Processing task for agent ${agentId} with task: ${task}`,
          );

          // Perform agent-related tasks here.

          break;
        }
        default: {
          throw new Error(`Unknown agent job: ${job.name}`);
        }
      }

      logger.info(`Completed agent jobId: ${job.id} name: ${job.name}`);
      return { success: true };
    },
  });

  agentWorker.on('ready', () => {
    logger.info('Agent processor is ready and listening for jobs');
  });

  return agentWorker;
}
