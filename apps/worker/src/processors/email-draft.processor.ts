import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import { createWorker, EMAIL_DRAFT_JOB, EMAIL_DRAFT_QUEUE, emailDraftJobSchema } from '@repo/queue';
import { generateEmailDraft } from '../mail/email-draft.service';

// A draft agent run can involve several tool calls before it writes the
// reply, same order of magnitude as a workflow agent node; stretched well
// past BullMQ's 30s default like gen-video's LOCK_DURATION_MS.
const LOCK_DURATION_MS = 10 * 60 * 1000;

export function registerEmailDraftJobProcessor(): Worker<any, any, string> {
  const emailDraftWorker = createWorker({
    name: EMAIL_DRAFT_QUEUE,
    processor: async (job) => {
      logger.info(`Processing email-draft jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case EMAIL_DRAFT_JOB: {
          const { accountId, threadId, replyToMessageId, agentId } = emailDraftJobSchema.parse(job.data);
          await generateEmailDraft({ accountId, threadId, replyToMessageId, agentId });
          break;
        }
        default: {
          throw new Error(`Unknown email-draft job: ${job.name}`);
        }
      }

      logger.info(`Completed email-draft jobId: ${job.id} name: ${job.name}`);
      return { success: true };
    },
    opts: {
      // Low, like gen-video/gen-images: agent runs are the expensive part.
      concurrency: 3,
      lockDuration: LOCK_DURATION_MS,
    },
  });

  emailDraftWorker.on('ready', () => {
    logger.info('Email-draft processor is ready and listening for jobs');
  });

  return emailDraftWorker;
}
