import { runGenImages } from '@repo/ai';
import { getGenImageRowsByIds } from '@repo/database';
import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import {
  createWorker,
  enqueueNotification,
  GEN_IMAGES_JOB,
  GEN_IMAGES_QUEUE,
  genImagesJobSchema,
} from '@repo/queue';
import { tryCatch } from '@repo/utils';

// A batch normally finishes in a few seconds, well under gen-video's
// multi-minute renders, but the lock is stretched the same way
// (gen-video.processor.ts): comfortably above a genuinely slow batch's real
// ceiling without leaving a stuck job locked for ages.
const LOCK_DURATION_MS = 5 * 60 * 1000;

export function registerGenImagesJobProcessor(): Worker<any, any, string> {
  const genImagesWorker = createWorker({
    name: GEN_IMAGES_QUEUE,
    processor: async (job) => {
      logger.info(`Processing gen-images jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case GEN_IMAGES_JOB: {
          const { genImageIds } = genImagesJobSchema.parse(job.data);
          await processGenImages(genImageIds);
          break;
        }
        default: {
          throw new Error(`Unknown gen-images job: ${job.name}`);
        }
      }

      logger.info(`Completed gen-images jobId: ${job.id} name: ${job.name}`);
      return { success: true };
    },
    opts: {
      // Low, like gen-video's: a handful of concurrent provider calls at
      // once is plenty for now.
      concurrency: 2,
      lockDuration: LOCK_DURATION_MS,
    },
  });

  genImagesWorker.on('ready', () => {
    logger.info('Gen-images processor is ready and listening for jobs');
  });

  return genImagesWorker;
}

// runGenImages already leaves every row in the batch 'failed' with an error
// message before it rethrows, so this only needs to notify and propagate.
// The enqueuer (requestGenImages in @repo/ai) never sets a retry count above
// the BullMQ default of one attempt: a failed batch must surface as a failed
// job, not silently re-render and double the cost.
async function processGenImages(genImageIds: string[]): Promise<void> {
  const { error } = await tryCatch(() => runGenImages({ genImageIds }));

  if (error === null) {
    await notifyBestEffort({ genImageIds, type: 'image_generation_succeeded' });
    return;
  }

  await notifyBestEffort({ genImageIds, type: 'image_generation_failed' });
  throw error;
}

// Best-effort by design: a notification failure must never mask the job's
// real outcome (the rows and the rethrown/absent error already carry that),
// so every failure here is logged and swallowed. One notification per batch,
// not per row.
async function notifyBestEffort({
  genImageIds,
  type,
}: {
  genImageIds: string[];
  type: 'image_generation_succeeded' | 'image_generation_failed';
}): Promise<void> {
  try {
    const [record] = await getGenImageRowsByIds({ ids: genImageIds });
    if (!record) {
      logger.error(`Gen images ${genImageIds.join(', ')} not found, skipping notification`);
      return;
    }

    await enqueueNotification({
      userId: record.userId,
      type,
      data: {
        genImageIds,
        workspaceId: record.workspaceId,
        prompt: record.prompt,
      },
    });
  } catch (notifyError) {
    logger.error(
      `Failed to enqueue ${type} notification for gen images ${genImageIds.join(', ')}:`,
      notifyError,
    );
  }
}
