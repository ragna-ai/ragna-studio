import type { SocialPostMediaWithMedia } from '@repo/database';
import { createLinkedinClient, LinkedinApiError } from '@repo/linkedin';
import { logger } from '@repo/logger';
import { downloadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';

// LinkedIn can take a little while to finish processing an uploaded image.
const IMAGE_AVAILABLE_TIMEOUT_MS = 45_000;

export type PublishableImage = { urn: string; altText?: string };

export type UploadPostMediaResult = { imageUrns: PublishableImage[] } | { error: string };

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
  media: SocialPostMediaWithMedia[];
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
  media: SocialPostMediaWithMedia;
  authorId: string;
}): Promise<string> {
  const { buffer, contentType } = await downloadObjectBuffer(
    media.media.bucket,
    media.media.storageKey,
  );

  const { uploadUrl, imageUrn } = await linkedin.initializeImageUpload({ authorId });

  await linkedin.uploadImageBinary({
    uploadUrl,
    data: buffer,
    mimeType: media.mimeType || contentType,
  });

  await linkedin.waitForImageAvailable({ imageUrn, timeoutMs: IMAGE_AVAILABLE_TIMEOUT_MS });

  return imageUrn;
}
