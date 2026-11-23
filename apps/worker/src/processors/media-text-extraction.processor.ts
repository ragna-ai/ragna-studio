import { AGENT_FILE_READ_MAX_CHARACTERS } from '@repo/ai';
import {
  claimMediaTextExtraction,
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
  UnrecoverableError,
} from '@repo/queue';
import { downloadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';

// Starts across all enqueues (job retries and sweep re-queues) before a file counts as poisonous.
const MAX_EXTRACTION_STARTS = 5;
const EXTRACTION_TIMEOUT_MS = 2 * 60 * 1000;

export interface MediaTextExtractionOptions {
  extract?: typeof extractText;
  timeoutMs?: number;
}

export function registerMediaTextExtractionJobProcessor(): Worker<any, any, string> {
  const mediaTextExtractionWorker = createWorker({
    name: MEDIA_TEXT_EXTRACTION_QUEUE,
    processor: (job) => processMediaTextExtractionJob(job),
  });

  mediaTextExtractionWorker.on('ready', () => {
    logger.info('Media text extraction processor is ready and listening for jobs');
  });

  return mediaTextExtractionWorker;
}

export async function processMediaTextExtractionJob(
  job: ProcessorJob,
  options: MediaTextExtractionOptions = {},
): Promise<ProcessorSuccess> {
  logger.info(`Processing media text extraction jobId: ${job.id} name: ${job.name}`);

  switch (job.name) {
    case EXTRACT_MEDIA_TEXT_JOB: {
      const { mediaId } = extractMediaTextJobSchema.parse(job.data);
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await extractMediaText({ mediaId, isLastAttempt, options });
      break;
    }
    default: {
      throw new Error(`Unknown media text extraction job: ${job.name}`);
    }
  }

  logger.info(`Completed media text extraction jobId: ${job.id} name: ${job.name}`);
  return { success: true };
}

async function failPermanently(mediaId: string, reason: string): Promise<never> {
  await markMediaTextExtractionFailed({ id: mediaId });
  throw new UnrecoverableError(`Text extraction for media ${mediaId} failed: ${reason}`);
}

/** Rejects after `timeoutMs`; the timer is always cleared. */
async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stores a pending media row's text and marks it 'ready'. A download error rethrows so BullMQ
 * retries (the last attempt marks the row 'failed'). A file that can't succeed on retry is
 * failed at once with an UnrecoverableError.
 */
async function extractMediaText({
  mediaId,
  isLastAttempt,
  options,
}: {
  mediaId: string;
  isLastAttempt: boolean;
  options: MediaTextExtractionOptions;
}): Promise<void> {
  const { extract = extractText, timeoutMs = EXTRACTION_TIMEOUT_MS } = options;
  const mediaRow = await claimMediaTextExtraction({ id: mediaId });

  if (!mediaRow) {
    logger.warn(`Media ${mediaId} is not pending text extraction, skipping`);
    return;
  }

  if (mediaRow.textExtractionAttempts > MAX_EXTRACTION_STARTS) {
    logger.error(`Media ${mediaId} started text extraction too often, marking it failed`);
    await markMediaTextExtractionFailed({ id: mediaId });
    return;
  }

  const kind = getMediaKindByMimeType(mediaRow.mimeType);

  if (!kind) {
    return failPermanently(mediaId, `no media kind for mime type "${mediaRow.mimeType}"`);
  }

  const { error: downloadError, data: downloaded } = await tryCatch(() =>
    downloadObjectBuffer(mediaRow.bucket, mediaRow.storageKey),
  );

  if (downloadError !== null || downloaded === null) {
    logger.error(`Failed to download media ${mediaId} for text extraction`, downloadError);

    if (isLastAttempt) {
      await markMediaTextExtractionFailed({ id: mediaId });
    }

    throw downloadError ?? new Error(`Download of media ${mediaId} returned nothing`);
  }

  const { error: extractError, data: text } = await tryCatch(() =>
    withTimeout(extract({ buffer: downloaded.buffer, kind }), timeoutMs),
  );

  if (extractError !== null || text === null) {
    logger.error(`Failed to extract text for media ${mediaId}`, extractError);
    return failPermanently(mediaId, extractError?.message ?? 'no text returned');
  }

  await markMediaTextExtractionReady({
    id: mediaId,
    extractedText: text.slice(0, AGENT_FILE_READ_MAX_CHARACTERS),
    extractedTextTruncated: text.length > AGENT_FILE_READ_MAX_CHARACTERS,
  });
}
