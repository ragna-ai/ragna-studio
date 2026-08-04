import type { Media } from '@repo/database';
import { deleteMediaById, findUnreferencedMediaOlderThan } from '@repo/database';
import { logger } from '@repo/logger';
import { deleteObjects } from '@repo/storage';
import { tryCatch } from '@repo/utils';

const UNREFERENCED_AGE_HOURS = 24;

// Safety net behind media.service.ts's synchronous refcount deletion
// (docs/media-library/prd.md, decision 2): a detach that crashes between the
// R2 delete and the DB delete, or loses the race with a fresh attachment,
// otherwise orphans a media row forever. Only rows still unreferenced after
// 24h are swept, so an in-flight upload never gets caught mid-attach.
export async function mediaSweepProcessor() {
  const staleMedia = await findUnreferencedMediaOlderThan({ hours: UNREFERENCED_AGE_HOURS });

  if (staleMedia.length === 0) {
    return;
  }

  let sweptCount = 0;
  for (const media of staleMedia) {
    const deleted = await deleteUnreferencedMedia(media);
    if (deleted) {
      sweptCount += 1;
    }
  }

  logger.debug(`Media sweep cron deleted ${sweptCount}/${staleMedia.length} unreferenced media row(s)`);
}

// Deletes the R2 object first and only removes the DB row once that
// succeeds. A failed R2 delete leaves the row in place so the next hourly
// run retries it, instead of the object orphaning invisibly.
async function deleteUnreferencedMedia(media: Media): Promise<boolean> {
  const { error, data } = await tryCatch(() => deleteObjects(media.bucket, [media.storageKey]));

  if (error !== null || data === null) {
    logger.error(`Media sweep cron failed to delete R2 object for media ${media.id}`, error);
    return false;
  }

  if (data.errors.length > 0) {
    logger.error(`Media sweep cron failed to delete R2 object for media ${media.id}`, {
      bucket: media.bucket,
      storageKey: media.storageKey,
    });
    return false;
  }

  await deleteMediaById({ id: media.id });
  return true;
}
