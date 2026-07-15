import { createNotification } from '@repo/database';
import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import { createWorker, NOTIFICATIONS_QUEUE, NotifyUserJobDto, NOTIFY_USER_JOB } from '@repo/queue';

export function registerNotificationJobProcessor(): Worker<any, any, string> {
  const notificationWorker = createWorker({
    name: NOTIFICATIONS_QUEUE,
    processor: async (job) => {
      logger.info(`Processing notification jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case NOTIFY_USER_JOB: {
          const { userId, type, data } = NotifyUserJobDto.fromJSON(job.data);
          // No rendering here: the row stores only the event (type + data).
          // Title/message/link are rendered on read by the web presenter. This
          // is also the future fan-out point for email/push channels.
          await createNotification({ userId, type, data });
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
