import { AGENT_FILE_READ_MAX_CHARACTERS } from '@repo/ai';
import {
  getMediaById,
  markMediaTextExtractionFailed,
  markMediaTextExtractionReady,
} from '@repo/database';
import { logger } from '@repo/logger';
import { extractText, getMediaKindByMimeType } from '@repo/media';
import type { ProcessorJob, ProcessorSuccess, Worker } from '@repo/queue';
import {
  createWorker,
  EXTRACT_MEDIA_TEXT_JOB,
  extractMediaTextJobSchema,
  MEDIA_TEXT_EXTRACTION_QUEUE,
} from '@repo/queue';
import { downloadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';

export function registerMediaTextExtractionJobProcessor(): Worker<any, any, string> {
  const mediaTextExtractionWorker = createWorker({
    name: MEDIA_TEXT_EXTRACTION_QUEUE,
    processor: processMediaTextExtractionJob,
  });

  mediaTextExtractionWorker.on('ready', () => {
    logger.info('Media text extraction processor is ready and listening for jobs');
  });

  return mediaTextExtractionWorker;
}

export async function processMediaTextExtractionJob(job: ProcessorJob): Promise<ProcessorSuccess> {
  logger.info(`Processing media text extraction jobId: ${job.id} name: ${job.name}`);

  switch (job.name) {
    case EXTRACT_MEDIA_TEXT_JOB: {
      const { mediaId } = extractMediaTextJobSchema.parse(job.data);
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await extractMediaText({ mediaId, isLastAttempt });
      break;
    }
    default: {
      throw new Error(`Unknown media text extraction job: ${job.name}`);
    }
  }

  logger.info(`Completed media text extraction jobId: ${job.id} name: ${job.name}`);
  return { success: true };
}

/**
 * Stores a pending media row's text and marks it 'ready'. A failure rethrows so
 * BullMQ retries; the last attempt marks the row 'failed' first.
 */
async function extractMediaText({
  mediaId,
  isLastAttempt,
}: {
  mediaId: string;
  isLastAttempt: boolean;
}): Promise<void> {
  const mediaRow = await getMediaById({ id: mediaId });

  if (mediaRow?.textExtractionStatus !== 'pending') {
    logger.warn(`Media ${mediaId} is not pending text extraction, skipping`);
    return;
  }

  const { error, data: text } = await tryCatch(async () => {
    const kind = getMediaKindByMimeType(mediaRow.mimeType);

    if (!kind) {
      throw new Error(`No media kind registered for mime type "${mediaRow.mimeType}"`);
    }

    const { buffer } = await downloadObjectBuffer(mediaRow.bucket, mediaRow.storageKey);
    return extractText({ buffer, kind });
  });

  if (error !== null || text === null) {
    logger.error(`Failed to extract text for media ${mediaId}`, error);

    if (isLastAttempt) {
      await markMediaTextExtractionFailed({ id: mediaId });
    }

    throw error ?? new Error(`Text extraction for media ${mediaId} returned nothing`);
  }

  await markMediaTextExtractionReady({
    id: mediaId,
    extractedText: text.slice(0, AGENT_FILE_READ_MAX_CHARACTERS),
    extractedTextTruncated: text.length > AGENT_FILE_READ_MAX_CHARACTERS,
  });
}
