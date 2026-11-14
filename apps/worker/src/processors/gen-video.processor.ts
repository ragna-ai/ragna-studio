import { runGenVideo } from '@repo/ai';
import { logger } from '@repo/logger';
import type { ProcessorJob, ProcessorSuccess, Worker } from '@repo/queue';
import { createWorker, GEN_VIDEO_JOB, GEN_VIDEOS_QUEUE, genVideoJobSchema } from '@repo/queue';
import { tryCatch } from '@repo/utils';
import { notifyVideoGenerationBestEffort } from '../services/generation-notifications';

// Veo renders take 1-6 minutes. The
// default 30s lock would let BullMQ's stalled checker reclaim an in-flight
// render, so the lock is stretched to comfortably outlast a 10-minute job.
const LOCK_DURATION_MS = 10 * 60 * 1000;

export function registerGenVideoJobProcessor(): Worker<any, any, string> {
  const genVideoWorker = createWorker({
    name: GEN_VIDEOS_QUEUE,
    processor: processGenVideoJob,
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

export async function processGenVideoJob(job: ProcessorJob): Promise<ProcessorSuccess> {
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
}

// runGenVideo already leaves the row 'failed' with an error message before
// it rethrows, so this only needs to notify and propagate. The enqueuer
// (requestGenVideo in @repo/ai) never sets a retry count above the BullMQ
// default of one attempt: a failed multi-minute render must surface as a
// failed job, not silently re-render and double the cost. A labeled video is
// notified by the visible-watermark job once it completes.
async function processGenVideo(genVideoId: string): Promise<void> {
  const { error, data: result } = await tryCatch(() => runGenVideo({ genVideoId }));

  if (error !== null) {
    await notifyVideoGenerationBestEffort({ genVideoId, type: 'video_generation_failed' });
    throw error;
  }

  if (result?.outcome === 'completed') {
    await notifyVideoGenerationBestEffort({ genVideoId, type: 'video_generation_succeeded' });
  }
}
