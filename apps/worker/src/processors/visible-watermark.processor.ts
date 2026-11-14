import { logger } from '@repo/logger';
import type { ProcessorJob, ProcessorSuccess, Worker } from '@repo/queue';
import {
  APPLY_VISIBLE_WATERMARK_JOB,
  createWorker,
  VISIBLE_WATERMARK_QUEUE,
  visibleWatermarkJobSchema,
} from '@repo/queue';
import {
  notifyImageGenerationBestEffort,
  notifyVideoGenerationBestEffort,
} from '../services/generation-notifications';
import {
  defaultWatermarkTransforms,
  watermarkGenImages,
  watermarkGenVideo,
} from '../services/visible-watermark.service';
import type { WatermarkTransforms } from '../services/visible-watermark.service';

// Video labeling re-encodes the whole clip with ffmpeg, so the lock is stretched like gen-video's.
const LOCK_DURATION_MS = 10 * 60 * 1000;

export function registerVisibleWatermarkJobProcessor(): Worker<any, any, string> {
  const visibleWatermarkWorker = createWorker({
    name: VISIBLE_WATERMARK_QUEUE,
    processor: (job) => processVisibleWatermarkJob(job),
    opts: {
      concurrency: 2,
      lockDuration: LOCK_DURATION_MS,
    },
  });

  visibleWatermarkWorker.on('ready', () => {
    logger.info('Visible-watermark processor is ready and listening for jobs');
  });

  return visibleWatermarkWorker;
}

export async function processVisibleWatermarkJob(
  job: ProcessorJob,
  transforms: WatermarkTransforms = defaultWatermarkTransforms,
): Promise<ProcessorSuccess> {
  logger.info(`Processing visible-watermark jobId: ${job.id} name: ${job.name}`);

  switch (job.name) {
    case APPLY_VISIBLE_WATERMARK_JOB: {
      const data = visibleWatermarkJobSchema.parse(job.data);
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      if (data.kind === 'image') {
        const { completed } = await watermarkGenImages({ data, isLastAttempt, transforms });
        if (completed) {
          await notifyImageGenerationBestEffort({
            genImageIds: data.genImageIds,
            type: 'image_generation_succeeded',
          });
        }
        break;
      }

      const { completed } = await watermarkGenVideo({ data, isLastAttempt, transforms });
      if (completed) {
        await notifyVideoGenerationBestEffort({
          genVideoId: data.genVideoId,
          type: 'video_generation_succeeded',
        });
      }
      break;
    }
    default: {
      throw new Error(`Unknown visible-watermark job: ${job.name}`);
    }
  }

  logger.info(`Completed visible-watermark jobId: ${job.id} name: ${job.name}`);
  return { success: true };
}
