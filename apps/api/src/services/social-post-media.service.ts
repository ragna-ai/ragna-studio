import type { SocialPostMediaWithMedia } from '@repo/database';
import type { LinkedinImage, LinkedinPublisher } from '@repo/integrations/social';
import { downloadObjectBuffer } from '@repo/storage';

export interface UploadSocialPostImagesParams {
  publisher: LinkedinPublisher;
  media: SocialPostMediaWithMedia[];
}

/**
 * Uploads a draft's attached media ahead of publishing, one image at a time
 * so a failure on image N doesn't leave the images after it half-uploaded.
 */
export async function uploadSocialPostImages({
  publisher,
  media,
}: UploadSocialPostImagesParams): Promise<LinkedinImage[]> {
  const images: LinkedinImage[] = [];

  for (const item of media) {
    const { buffer, contentType } = await downloadObjectBuffer(
      item.media.bucket,
      item.media.storageKey,
    );
    const image = await publisher.uploadImage({
      bytes: buffer,
      mimeType: item.mimeType || contentType,
      altText: item.altText ?? undefined,
    });
    images.push(image);
  }

  return images;
}
