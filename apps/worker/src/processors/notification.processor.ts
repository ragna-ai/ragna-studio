import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import { createWorker, NOTIFICATION_QUEUE, NOTIFY_USER_JOB } from '@repo/queue';

export function registerNotificationJobProcessor(): Worker<any, any, string> {
  const notificationWorker = createWorker({
    name: NOTIFICATION_QUEUE,
    processor: async (job) => {
      const data = job.data;
      logger.info(`Processing notification jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case NOTIFY_USER_JOB: {
          const { userId, message } = data;
          logger.debug(
            `Sending notification to userId: ${userId} with message: ${message}`,
          );

          // Simulate sending notification
          await new Promise((resolve) => setTimeout(resolve, 1000));
          break;
        }
        default: {
          throw new Error(`Unknown notification job: ${job.name}`);
        }
      }

      logger.info(`Completed notification jobId: ${job.id} name: ${job.name}`);
      return { success: true };
    },
  });

  notificationWorker.on('ready', () => {
    logger.info('Notification processor is ready and listening for jobs');
  });

  return notificationWorker;
}
