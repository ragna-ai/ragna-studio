import { logger } from '@repo/logger';
import { sweepUnreferencedMedia } from '@repo/media';

const UNREFERENCED_AGE_HOURS = 24;

// Safety net behind media.service.ts's synchronous refcount deletion:
// a detach that crashes between the
// R2 delete and the DB delete, or loses the race with a fresh attachment,
// otherwise orphans a media row forever. Only rows still unreferenced after
// 24h are swept, so an in-flight upload never gets caught mid-attach.
// Deletion itself (refcount re-check, best-effort R2 delete, row delete)
// lives in @repo/media's sweepUnreferencedMedia, shared with every other
// detach point.
export async function mediaSweepProcessor() {
  const { candidateCount } = await sweepUnreferencedMedia({
    olderThanHours: UNREFERENCED_AGE_HOURS,
  });

  if (candidateCount === 0) {
    return;
  }

  logger.debug(`Media sweep cron processed ${candidateCount} unreferenced media candidate(s)`);
}
