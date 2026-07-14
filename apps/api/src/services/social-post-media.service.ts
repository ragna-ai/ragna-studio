import type { SocialPostMedia } from '@repo/database';
import { createLinkedinClient, LinkedinApiError } from '@repo/linkedin';
import { logger } from '@repo/logger';
import { deleteObjects, downloadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';

// Same bucket packages/ai's imagen.service.ts uploads generated images to.
// User-uploaded social media also lands here, under a `social/{userId}/`
// prefix (see the media upload route in social-post.controller.ts).
const IMAGE_BUCKET_NAME = 'ragna-cloud-images';

// LinkedIn can take a little while to finish processing an uploaded image.
const IMAGE_AVAILABLE_TIMEOUT_MS = 45_000;

export type PublishableImage = { urn: string; altText?: string };

export type UploadPostMediaResult = { imageUrns: PublishableImage[] } | { error: string };

/**
 * Deletes the R2 objects for `upload`-origin media rows. `genImage`-origin
 * rows are skipped: their object belongs to the gen_images row, not to this
 * media row, so only the caller's DB delete should touch them. The single
 * entry point for this rule, called from every route that removes media
 * rows (media delete, post delete), so the two can't drift apart.
 *
 * Best-effort: a failed R2 delete is logged, not thrown, so a stray object
 * never blocks the user-facing delete action that triggered it.
 */
export async function deleteUploadedMediaObjects(media: SocialPostMedia[]): Promise<void> {
  const keys = media.filter((item) => item.origin === 'upload').map((item) => item.storageKey);

  if (keys.length === 0) {
    return;
  }

  const { error, data } = await tryCatch(() => deleteObjects(IMAGE_BUCKET_NAME, keys));

  if (error !== null) {
    logger.error('Failed to delete social post media objects from R2', { error, keys });
    return;
  }

  if (data && data.errors.length > 0) {
    logger.error('Failed to delete some social post media objects from R2', {
      keys: data.errors,
    });
  }
}

/**
 * Uploads a draft's attached media to LinkedIn ahead of publishing. For each
 * attachment: fetch its bytes from R2, register the upload with LinkedIn,
 * PUT the bytes, then wait for LinkedIn to finish processing it. Runs one
 * image at a time so a failure on image N doesn't leave images after it
 * half-uploaded for no reason.
 */
export async function uploadPostMediaToLinkedIn({
  media,
  accessToken,
  authorId,
}: {
  media: SocialPostMedia[];
  accessToken: string;
  authorId: string;
}): Promise<UploadPostMediaResult> {
  if (media.length === 0) {
    return { imageUrns: [] };
  }

  const linkedin = createLinkedinClient(accessToken);
  const imageUrns: PublishableImage[] = [];

  for (const item of media) {
    const { error, data: urn } = await tryCatch(() =>
      uploadOneImageToLinkedIn({ linkedin, media: item, authorId }),
    );

    if (error !== null || !urn) {
      logger.error('Failed to upload post media to LinkedIn', { error, mediaId: item.id });
      const reason =
        error instanceof LinkedinApiError ? error.message : 'Failed to upload an image';
      return { error: reason };
    }

    imageUrns.push({ urn, altText: item.altText ?? undefined });
  }

  return { imageUrns };
}

async function uploadOneImageToLinkedIn({
  linkedin,
  media,
  authorId,
}: {
  linkedin: ReturnType<typeof createLinkedinClient>;
  media: SocialPostMedia;
  authorId: string;
}): Promise<string> {
  const { buffer, contentType } = await downloadObjectBuffer(IMAGE_BUCKET_NAME, media.storageKey);

  const { uploadUrl, imageUrn } = await linkedin.initializeImageUpload({ authorId });

  await linkedin.uploadImageBinary({
    uploadUrl,
    data: buffer,
    mimeType: media.mimeType || contentType,
  });

  await linkedin.waitForImageAvailable({ imageUrn, timeoutMs: IMAGE_AVAILABLE_TIMEOUT_MS });

  return imageUrn;
}
