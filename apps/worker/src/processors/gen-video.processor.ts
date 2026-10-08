import { runGenVideo } from '@repo/ai';
import { getGenVideoById } from '@repo/database';
import { logger } from '@repo/logger';
import type { Worker } from '@repo/queue';
import {
  createWorker,
  enqueueNotification,
  GEN_VIDEO_JOB,
  GEN_VIDEOS_QUEUE,
  genVideoJobSchema,
} from '@repo/queue';
import { tryCatch } from '@repo/utils';

// Veo renders take 1-6 minutes. The
// default 30s lock would let BullMQ's stalled checker reclaim an in-flight
// render, so the lock is stretched to comfortably outlast a 10-minute job.
const LOCK_DURATION_MS = 10 * 60 * 1000;

export function registerGenVideoJobProcessor(): Worker<any, any, string> {
  const genVideoWorker = createWorker({
    name: GEN_VIDEOS_QUEUE,
    processor: async (job) => {
      logger.info(`Processing gen-video jobId: ${job.id} name: ${job.name}`);

      switch (job.name) {
        case GEN_VIDEO_JOB: {
          const { genVideoId } = genVideoJobSchema.parse(job.data);
          await processGenVideo(genVideoId);
          break;
        }
        default: {
          throw new Error(`Unknown gen-video job: ${job.name}`);
        }
      }

      logger.info(`Completed gen-video jobId: ${job.id} name: ${job.name}`);
      return { success: true };
    },
    opts: {
      // Low on purpose: Veo renders are slow and expensive, so only a
      // couple can run at once.
      concurrency: 2,
      lockDuration: LOCK_DURATION_MS,
    },
  });

  genVideoWorker.on('ready', () => {
    logger.info('Gen-video processor is ready and listening for jobs');
  });

  return genVideoWorker;
}

// runGenVideo already leaves the row 'failed' with an error message before
// it rethrows, so this only needs to notify and propagate. The enqueuer
// (requestGenVideo in @repo/ai) never sets a retry count above the BullMQ
// default of one attempt: a failed multi-minute render must surface as a
// failed job, not silently re-render and double the cost.
async function processGenVideo(genVideoId: string): Promise<void> {
  const { error } = await tryCatch(() => runGenVideo({ genVideoId }));

  if (error !== null) {
    await notifyBestEffort({ genVideoId, type: 'video_generation_failed' });
    throw error;
  }

  await notifyBestEffort({ genVideoId, type: 'video_generation_succeeded' });
}

// Best-effort by design: a notification failure must never mask the job's
// real outcome (the row and the rethrown/absent error already carry that),
// so every failure here is logged and swallowed.
async function notifyBestEffort({
  genVideoId,
  type,
}: {
  genVideoId: string;
  type: 'video_generation_succeeded' | 'video_generation_failed';
}): Promise<void> {
  try {
    const record = await getGenVideoById({ id: genVideoId });
    if (!record) {
      logger.error(`Gen video ${genVideoId} not found, skipping notification`);
      return;
    }

    await enqueueNotification({
      userId: record.userId,
      type,
      data: {
        genVideoId: record.id,
        workspaceId: record.workspaceId,
        prompt: record.prompt,
      },
    });
  } catch (notifyError) {
    logger.error(
      `Failed to enqueue ${type} notification for gen video ${genVideoId}:`,
      notifyError,
    );
  }
}
