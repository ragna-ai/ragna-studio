import { getMediaIdsPendingTextExtraction } from '@repo/database';
import { logger } from '@repo/logger';
import { buildExtractMediaTextJob, queue } from '@repo/queue';

const PENDING_GRACE_MS = 10 * 60 * 1000;
const SWEEP_BATCH_SIZE = 500;

// Re-queues extraction for uploads whose enqueue failed and for backfilled rows.
// The media id is the job id, so a file already queued isn't queued twice.
export async function mediaTextExtractionSweepProcessor() {
  const mediaIds = await getMediaIdsPendingTextExtraction({
    createdBefore: new Date(Date.now() - PENDING_GRACE_MS),
    limit: SWEEP_BATCH_SIZE,
  });

  if (mediaIds.length === 0) {
    return;
  }

  await queue.mediaTextExtraction().addBulk(mediaIds.map(buildExtractMediaTextJob));

  logger.info(`Media text extraction sweep re-queued ${mediaIds.length} file(s)`);
}
