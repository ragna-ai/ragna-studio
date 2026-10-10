import { logger } from '@repo/logger';
import { deleteMediaObjectsByKeys, purgeOrganization } from '@repo/media';
import type { ProcessorJob, Worker } from '@repo/queue';
import {
  createWorker,
  DELETE_MEDIA_OBJECTS_JOB,
  deleteMediaObjectsJobSchema,
  PURGE_ORGANIZATION_JOB,
  PURGE_QUEUE,
  purgeOrganizationJobSchema,
} from '@repo/queue';

export function registerPurgeJobProcessor(): Worker<any, any, string> {
  const purgeWorker = createWorker({
    name: PURGE_QUEUE,
    processor: processPurgeJob,
  });

  purgeWorker.on('ready', () => {
    logger.info('Purge processor is ready and listening for jobs');
  });

  return purgeWorker;
}

export async function processPurgeJob(job: ProcessorJob): Promise<void> {
  logger.info(`Processing purge jobId: ${job.id} name: ${job.name}`);

  switch (job.name) {
    case PURGE_ORGANIZATION_JOB: {
      const { organizationId } = purgeOrganizationJobSchema.parse(job.data);
      await purgeOrganization({ organizationId });
      break;
    }
    case DELETE_MEDIA_OBJECTS_JOB: {
      const { objects } = deleteMediaObjectsJobSchema.parse(job.data);
      await deleteMediaObjectsByKeys({ objects });
      break;
    }
    default: {
      throw new Error(`Unknown purge job: ${job.name}`);
    }
  }

  logger.info(`Completed purge jobId: ${job.id} name: ${job.name}`);
}
