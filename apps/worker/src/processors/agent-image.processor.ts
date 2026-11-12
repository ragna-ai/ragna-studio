import { logger } from '@repo/logger';
import { shrinkAgentImage } from '@repo/media';
import type { ProcessorJob, ProcessorSuccess, Worker } from '@repo/queue';
import {
  AGENT_IMAGE_QUEUE,
  createWorker,
  PROCESS_AGENT_IMAGE_JOB,
  processAgentImageJobSchema,
} from '@repo/queue';

export async function processAgentImageJob(job: ProcessorJob): Promise<ProcessorSuccess> {
  logger.info(`Processing agent image jobId: ${job.id} name: ${job.name}`);

  switch (job.name) {
    case PROCESS_AGENT_IMAGE_JOB: {
      const { mediaId } = processAgentImageJobSchema.parse(job.data);
      await shrinkAgentImage({ mediaId });
      break;
    }
    default: {
      throw new Error(`Unknown agent image job: ${job.name}`);
    }
  }

  logger.info(`Completed agent image jobId: ${job.id} name: ${job.name}`);
  return { success: true };
}

export function registerAgentImageJobProcessor(): Worker<any, any, string> {
  const agentImageWorker = createWorker({
    name: AGENT_IMAGE_QUEUE,
    processor: processAgentImageJob,
  });

  agentImageWorker.on('ready', () => {
    logger.info('Agent image processor is ready and listening for jobs');
  });

  return agentImageWorker;
}
