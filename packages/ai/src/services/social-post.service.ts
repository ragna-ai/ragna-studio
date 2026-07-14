import type { SocialPost, SocialPostMedia } from '@repo/database';
import {
  createSocialPost,
  createSocialPostMediaRecords,
  deleteSocialPostMediaByPostId,
  getGenImagesByIds,
  getSocialPostById,
  updateSocialPostContent,
} from '@repo/database';
import { logger } from '@repo/logger';
import { deleteObjects } from '@repo/storage';
import { tryCatch } from '@repo/utils';

export type DraftLinkedInPostInput = {
  userId: string;
  text: string;
  /** Revise this existing draft instead of creating a new one. */
  draftId?: string;
  /**
   * gen_images ids to attach, in display order. Omit to leave a revised
   * draft's images untouched; pass `[]` to clear them. New drafts with no
   * imageIds are created without images.
   */
  imageIds?: string[];
};

export type DraftLinkedInPostResult =
  | { id: string; status: SocialPost['status'] }
  | { error: string };

// LinkedIn's own limit. Enforced here rather than only in the tool's Zod
// schema, because the workflow tool node calls this service directly with a
// resolved template string, skipping that schema entirely.
const LINKEDIN_POST_MAX_LENGTH = 3000;

// LinkedIn's multiImage post cap. Enforced here for the same reason as
// LINKEDIN_POST_MAX_LENGTH above.
const LINKEDIN_MAX_IMAGES = 9;

// Generated images are always uploaded as PNG by imagen.service.ts; the
// gen_images table doesn't store a mime type, so this mirrors that fact
// rather than guessing from the file extension.
const GEN_IMAGE_MIME_TYPE = 'image/png';

// Same bucket packages/ai's imagen.service.ts uploads generated images to,
// and where apps/api stores user uploads under a `social/{userId}/` prefix.
const MEDIA_BUCKET_NAME = 'ragna-cloud-images';

function validatePostText(text: string): string | null {
  if (text.length < 1) {
    return 'The post content cannot be empty.';
  }
  if (text.length > LINKEDIN_POST_MAX_LENGTH) {
    return `The post content must be at most ${LINKEDIN_POST_MAX_LENGTH} characters (LinkedIn's limit).`;
  }
  return null;
}

/**
 * Creates a new LinkedIn draft, or revises an existing one, for the agent's
 * `linkedinDraft` tool. This is a pure DB write: publishing needs a token and
 * happens later, only when the user triggers it.
 */
export async function draftLinkedInPost({
  userId,
  text,
  draftId,
  imageIds,
}: DraftLinkedInPostInput): Promise<DraftLinkedInPostResult> {
  const validationError = validatePostText(text);
  if (validationError) {
    return { error: validationError };
  }

  if (imageIds && imageIds.length > LINKEDIN_MAX_IMAGES) {
    return { error: `A LinkedIn post supports at most ${LINKEDIN_MAX_IMAGES} images.` };
  }

  if (draftId) {
    return reviseDraft({ userId, text, draftId, imageIds });
  }

  const { error, data: created } = await tryCatch(() =>
    createSocialPost({ userId, platform: 'linkedin', content: text, source: 'agent' }),
  );

  if (error !== null || !created) {
    logger.error('Failed to create LinkedIn draft', { error });
    return { error: 'Failed to create the LinkedIn draft.' };
  }

  if (imageIds !== undefined) {
    const mediaError = await attachImagesToDraft({
      postId: created.id,
      userId,
      imageIds,
      existingMedia: [],
    });
    if (mediaError) {
      return { error: mediaError };
    }
  }

  return { id: created.id, status: created.status };
}

async function reviseDraft({
  userId,
  text,
  draftId,
  imageIds,
}: {
  userId: string;
  text: string;
  draftId: string;
  imageIds?: string[];
}): Promise<DraftLinkedInPostResult> {
  const { error: findError, data: existing } = await tryCatch(() =>
    getSocialPostById({ id: draftId, userId }),
  );

  if (findError !== null) {
    logger.error('Failed to load LinkedIn draft', { findError });
    return { error: 'Failed to load the existing draft.' };
  }

  if (!existing) {
    return { error: 'Draft not found.' };
  }

  if (existing.status !== 'draft') {
    return { error: `Only drafts can be revised. This post is already ${existing.status}.` };
  }

  const { error: updateError, data: updated } = await tryCatch(() =>
    updateSocialPostContent({ id: draftId, userId, content: text }),
  );

  if (updateError !== null || !updated) {
    logger.error('Failed to update LinkedIn draft', { updateError });
    return { error: 'Failed to update the draft.' };
  }

  if (imageIds !== undefined) {
    const mediaError = await attachImagesToDraft({
      postId: draftId,
      userId,
      imageIds,
      existingMedia: existing.media,
    });
    if (mediaError) {
      return { error: mediaError };
    }
  }

  return { id: updated.id, status: updated.status };
}

/**
 * Deletes the R2 objects for `upload`-origin media that is about to lose its
 * DB row. `genImage`-origin media is skipped: its object belongs to the
 * gen_images row, not to this media row. Mirrors
 * apps/api's social-post-media.service.ts `deleteUploadedMediaObjects`;
 * kept separate because a package can't reach into an app, but the rule
 * (only 'upload' objects die with the row) must stay identical.
 *
 * Best-effort: a failed R2 delete is logged, not thrown, so it never blocks
 * the draft revision that triggered it.
 */
async function deleteUploadedMediaObjects(media: SocialPostMedia[]): Promise<void> {
  const keys = media.filter((item) => item.origin === 'upload').map((item) => item.storageKey);

  if (keys.length === 0) {
    return;
  }

  const { error, data } = await tryCatch(() => deleteObjects(MEDIA_BUCKET_NAME, keys));

  if (error !== null) {
    logger.error('Failed to delete LinkedIn draft image objects from R2', { error, keys });
    return;
  }

  if (data && data.errors.length > 0) {
    logger.error('Failed to delete some LinkedIn draft image objects from R2', {
      keys: data.errors,
    });
  }
}

/**
 * Replaces a draft's attached images with the given gen_images ids, in
 * order. Ownership is checked before anything is written: an id that isn't
 * a gen_images row belonging to userId fails the whole call instead of
 * silently attaching someone else's image. `existingMedia` is the draft's
 * media set before this call, passed in by the caller (already loaded to
 * check draft status) so any `upload`-origin rows being replaced can have
 * their R2 objects cleaned up too.
 */
async function attachImagesToDraft({
  postId,
  userId,
  imageIds,
  existingMedia,
}: {
  postId: string;
  userId: string;
  imageIds: string[];
  existingMedia: SocialPostMedia[];
}): Promise<string | null> {
  if (imageIds.length === 0) {
    const { error } = await tryCatch(() => deleteSocialPostMediaByPostId({ socialPostId: postId }));
    if (error !== null) {
      logger.error('Failed to clear LinkedIn draft images', { error });
      return 'Failed to update the draft images.';
    }
    await deleteUploadedMediaObjects(existingMedia);
    return null;
  }

  const { error: imagesError, data: genImages } = await tryCatch(() =>
    getGenImagesByIds({ ids: imageIds, userId }),
  );

  if (imagesError !== null || !genImages) {
    logger.error('Failed to load generated images for LinkedIn draft', { imagesError });
    return 'Failed to load the selected images.';
  }

  if (genImages.length !== imageIds.length) {
    return 'One or more selected images could not be found.';
  }

  const genImageById = new Map(genImages.map((image) => [image.id, image]));

  const { error: deleteError } = await tryCatch(() =>
    deleteSocialPostMediaByPostId({ socialPostId: postId }),
  );

  if (deleteError !== null) {
    logger.error('Failed to replace LinkedIn draft images', { deleteError });
    return 'Failed to update the draft images.';
  }

  await deleteUploadedMediaObjects(existingMedia);

  const { error: createError } = await tryCatch(() =>
    createSocialPostMediaRecords(
      // Order follows imageIds (the order the model asked for), not the
      // database query's return order.
      imageIds.map((imageId, index) => {
        const genImage = genImageById.get(imageId);
        // Unreachable: every id was confirmed present in genImageById above.
        if (!genImage) {
          throw new Error(`Missing generated image ${imageId}`);
        }
        return {
          socialPostId: postId,
          storageKey: genImage.storageKey,
          mimeType: GEN_IMAGE_MIME_TYPE,
          origin: 'genImage' as const,
          sortOrder: index,
        };
      }),
    ),
  );

  if (createError !== null) {
    logger.error('Failed to attach images to LinkedIn draft', { createError });
    return 'Failed to attach the selected images.';
  }

  return null;
}
