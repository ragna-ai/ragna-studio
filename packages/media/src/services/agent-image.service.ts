// packages/media/src/services/agent-image.service.ts
import { getMediaById, updateMediaStorage } from '@repo/database';
import { logger } from '@repo/logger';
import { downloadObjectBuffer, uploadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import sharp from 'sharp';
import { getAgentImageKey } from '../lib/media-keys';
import { MIME_TYPE_BY_MEDIA_KIND } from '../types';
import { deleteMediaObjectsByKeys } from './media.service';

/** Edge length of an agent's uploaded mark image. */
const AGENT_IMAGE_SIZE_PX = 80;

/**
 * Replaces an uploaded agent image with its 80 x 80 PNG version under a new key and points the
 * same media row at it, then deletes the original object. Idempotent: a row already at the new
 * key is left alone. A missing row (deleted while the job waited) is skipped.
 */
export async function shrinkAgentImage({ mediaId }: { mediaId: string }): Promise<void> {
  const mediaRow = await getMediaById({ id: mediaId });

  if (!mediaRow) {
    logger.warn(`Agent image ${mediaId} not found, skipping resize`);
    return;
  }

  const ownerId = mediaRow.ownerWorkspaceId ?? mediaRow.ownerUserId;
  if (!ownerId) {
    throw new Error(`Media ${mediaId} has no owner`);
  }

  const storageKey = getAgentImageKey({ ownerId, mediaId });
  if (mediaRow.storageKey === storageKey) {
    return;
  }

  const original = await downloadObjectBuffer(mediaRow.bucket, mediaRow.storageKey);
  const resized = await sharp(original.buffer)
    .resize(AGENT_IMAGE_SIZE_PX, AGENT_IMAGE_SIZE_PX, { fit: 'cover', position: 'centre' })
    .webp({ lossless: true })
    .toBuffer();
  const mimeType = MIME_TYPE_BY_MEDIA_KIND.webp;

  await uploadObjectBuffer({
    bucketName: mediaRow.bucket,
    key: storageKey,
    buffer: resized,
    contentType: mimeType,
  });
  await updateMediaStorage({ id: mediaId, storageKey, mimeType, size: resized.byteLength });

  const { error } = await tryCatch(() =>
    deleteMediaObjectsByKeys({
      objects: [{ bucket: mediaRow.bucket, key: mediaRow.storageKey }],
    }),
  );
  if (error !== null) {
    logger.error(`Failed to delete original agent image object of media ${mediaId}`, error);
  }
}
