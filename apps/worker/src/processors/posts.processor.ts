import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import { createWorker, POSTS_QUEUE } from '@repo/queue';

export function registerPostsJobProcessor(): Worker<any, any, string> {
  const postsWorker = createWorker({
    name: POSTS_QUEUE,
    processor: async (job) => {
      const data = job.data;
      logger.info(`Processing posts jobId: ${job.id}:`, data);

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 1000));

      logger.info(`Completed posts jobId: ${job.id}`);
      return { success: true };
    },
  });

  postsWorker.on('ready', () => {
    logger.info('Posts processor is ready and listening for jobs');
  });

  return postsWorker;
}
