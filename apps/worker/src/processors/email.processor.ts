import { logger } from '@repo/logger';
import { sendEmail } from '@repo/mail';
import type { Worker } from '@repo/queue';
import {
  createWorker,
  EMAILS_QUEUE,
  VERIFY_EMAIL_JOB,
  VerifyEmailJobDto,
  WELCOME_EMAIL_JOB,
  WelcomeEmailJobDto,
} from '@repo/queue';

export function registerSendEmailJobProcessor(): Worker<any, any, string> {
  const emailWorker = createWorker({
    name: EMAILS_QUEUE,
    processor: async (job) => {
      logger.info(`Processing email jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case VERIFY_EMAIL_JOB: {
          const { email, url } = VerifyEmailJobDto.fromJSON(job.data);

          await sendEmail({
            to: email,
            subject: 'Verify your email address',
            templateId: 'verify',
            variables: {
              url,
            },
          });

          break;
        }
        case WELCOME_EMAIL_JOB: {
          const { email, name } = WelcomeEmailJobDto.fromJSON(job.data);

          await sendEmail({
            to: email,
            subject: 'Welcome to SaaS App!',
            templateId: 'welcome',
            variables: {
              name,
            },
          });

          break;
        }
        default: {
          throw new Error(`Unknown email job: ${job.name}`);
        }
      }

      logger.info(`Completed email jobId: ${job.id} name: ${job.name}`);
      return { success: true };
    },
  });

  emailWorker.on('ready', () => {
    logger.info('Email processor is ready and listening for jobs');
  });

  return emailWorker;
}
