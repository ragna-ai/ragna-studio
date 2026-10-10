import { createNotification } from '@repo/database';
import { logger } from '@repo/logger';
import type { ProcessorJob, ProcessorSuccess, Worker } from '@repo/queue';
import {
  createWorker,
  NOTIFICATIONS_QUEUE,
  NOTIFY_USER_JOB,
  parseNotifyUserJob,
} from '@repo/queue';

export function registerNotificationJobProcessor(): Worker<any, any, string> {
  const notificationWorker = createWorker({
    name: NOTIFICATIONS_QUEUE,
    processor: processNotificationJob,
  });

  notificationWorker.on('ready', () => {
    logger.info('Notification processor is ready and listening for jobs');
  });

  return notificationWorker;
}

export async function processNotificationJob(job: ProcessorJob): Promise<ProcessorSuccess> {
  logger.info(`Processing notification jobId: ${job.id} name: ${job.name}`);

  switch (job.name) {
    case NOTIFY_USER_JOB: {
      const { userId, type, data } = parseNotifyUserJob(job.data);
      await createNotification({ userId, type, data });
      break;
    }
    default: {
      throw new Error(`Unknown notification job: ${job.name}`);
    }
  }

  logger.info(`Completed notification jobId: ${job.id} name: ${job.name}`);
  return { success: true };
}
