import { logger } from '@repo/logger';
import type { ProcessorJob, ProcessorSuccess, Worker } from '@repo/queue';
import {
  createWorker,
  EMAIL_CLASSIFY_JOB,
  EMAIL_CLASSIFY_QUEUE,
  emailClassifyJobSchema,
} from '@repo/queue';
import { classifyEmailMessage } from '../mail/email-classify.service';

export function registerEmailClassifyJobProcessor(): Worker<any, any, string> {
  const emailClassifyWorker = createWorker({
    name: EMAIL_CLASSIFY_QUEUE,
    processor: processEmailClassifyJob,
    opts: {
      // One cheap Haiku call plus a couple of DB round trips per job: safe
      // to run several at once.
      concurrency: 10,
    },
  });

  emailClassifyWorker.on('ready', () => {
    logger.info('Email-classify processor is ready and listening for jobs');
  });

  return emailClassifyWorker;
}

export async function processEmailClassifyJob(job: ProcessorJob): Promise<ProcessorSuccess> {
  logger.info(`Processing email-classify jobId: ${job.id} name: ${job.name}`);

  switch (job.name) {
    case EMAIL_CLASSIFY_JOB: {
      const { accountId, messageId } = emailClassifyJobSchema.parse(job.data);
      await classifyEmailMessage({ accountId, messageId });
      break;
    }
    default: {
      throw new Error(`Unknown email-classify job: ${job.name}`);
    }
  }

  logger.info(`Completed email-classify jobId: ${job.id} name: ${job.name}`);
  return { success: true };
}
