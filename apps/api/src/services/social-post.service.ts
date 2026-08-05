import { auth } from '@repo/auth/server';
import { config } from '@repo/config';
import type { SocialPost, SocialPostMedia, SocialPostMediaWithMedia, SocialPostWithMedia } from '@repo/database';
import {
  createMedia,
  createSocialPost,
  createSocialPostMediaRecords,
  deleteSocialPostById,
  deleteSocialPostMediaById,
  getAccountByUserIdAndProvider,
  getAllSocialPostsByWorkspaceId,
  getSocialPostById,
  getSocialPostCountByWorkspaceId,
  markSocialPostFailed,
  markSocialPostPublished,
  updateSocialPostContent,
  updateSocialPostMediaAltText,
} from '@repo/database';
import { createLinkedinClient } from '@repo/linkedin';
import { logger } from '@repo/logger';
import { deleteMediaIfUnreferenced } from '@repo/media';
import { uploadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { randomUUID } from 'node:crypto';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';
import { uploadPostMediaToLinkedIn } from './social-post-media.service';

// Returned instead of a generic 400 so the web app can show a "connect
// LinkedIn" hint rather than a plain error toast. Bypasses the normal
// exception -> { code, error } envelope on purpose (apps/api/src/app.ts
// onError doesn't forward extra fields), so publishSocialPost returns this
// as a sentinel result instead of throwing.
export const LINKEDIN_NOT_CONNECTED_ERROR_CODE = 'LINKEDIN_NOT_CONNECTED';

// Same bucket packages/ai's imagen.service.ts uploads generated images to
// (config.cfImagesBucketName). User uploads live under a `social/{userId}/`
// prefix so they don't collide with generated-image keys.
const MAX_MEDIA_PER_POST = 9;
const MAX_MEDIA_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const MEDIA_EXTENSION_BY_MIME_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
} as const;
type AllowedMediaMimeType = keyof typeof MEDIA_EXTENSION_BY_MIME_TYPE;

function isAllowedMediaMimeType(mimeType: string): mimeType is AllowedMediaMimeType {
  return mimeType in MEDIA_EXTENSION_BY_MIME_TYPE;
}

// storageKey lives on the joined media row now (docs/media-library/
// migration-prd.md), not directly on social_post_media; added back onto the
// flat response here since the frontend DTO still expects it alongside
// mediaId (external DTOs unchanged).
export type SocialPostMediaResponse = SocialPostMedia & { storageKey: string; imageUrl: string };

// Images are served through the same public CDN domain imagen.service.ts
// uses for generated images, since both live in the same R2 bucket.
function toMediaResponse({ media, ...rest }: SocialPostMediaWithMedia): SocialPostMediaResponse {
  return {
    ...rest,
    storageKey: media.storageKey,
    imageUrl: `https://images.ragna.app/${media.storageKey}`,
  };
}

function toPostResponse(post: SocialPostWithMedia) {
  return {
    ...post,
    media: post.media.map(toMediaResponse),
  };
}

/** Loads a post and 404s if it doesn't exist in the given workspace. */
async function loadOwnedPost({
  workspaceId,
  socialPostId,
}: {
  workspaceId: string;
  socialPostId: string;
}): Promise<SocialPostWithMedia> {
  const { error, data: post } = await tryCatch(() =>
    getSocialPostById({ id: socialPostId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to load social post', error);
    throw new InternalServerErrorException('Failed to load social post');
  }

  if (!post) {
    throw new NotFoundException('Social post not found');
  }

  return post;
}

export interface ListSocialPostsResult {
  posts: ReturnType<typeof toPostResponse>[];
  meta: { totalCount: number };
}

/**
 * [GET] /workspace/:workspaceId/social-post
 * Lists a workspace's posts with their media.
 */
export async function listSocialPosts({
  workspaceId,
  page,
  limit,
  sort,
}: {
  workspaceId: string;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
}): Promise<ListSocialPostsResult> {
  const offset = (page - 1) * limit;

  const { error: countError, data: totalCount } = await tryCatch(() =>
    getSocialPostCountByWorkspaceId({ workspaceId }),
  );

  if (countError !== null) {
    logger.error('Failed to count social posts', countError);
    throw new InternalServerErrorException('Failed to list social posts');
  }

  const { error, data: posts } = await tryCatch(() =>
    getAllSocialPostsByWorkspaceId({ workspaceId, limit, sort, offset }),
  );

  if (error !== null || !posts) {
    logger.error('Failed to list social posts', error);
    throw new InternalServerErrorException('Failed to list social posts');
  }

  return {
    posts: posts.map(toPostResponse),
    meta: { totalCount: totalCount ?? 0 },
  };
}

/**
 * [POST] /workspace/:workspaceId/social-post
 * Creates a new draft from the web editor. Content may start empty: the
 * user fills it in on the upsert page. Publish rejects empty content.
 */
export async function createSocialPostForUser({
  workspaceId,
  userId,
  content,
}: {
  workspaceId: string;
  userId: string;
  content: string;
}): Promise<ReturnType<typeof toPostResponse>> {
  const { error, data: created } = await tryCatch(() =>
    createSocialPost({ userId, workspaceId, platform: 'linkedin', content, source: 'user' }),
  );

  if (error !== null || !created) {
    logger.error('Failed to create social post', error);
    throw new InternalServerErrorException('Failed to create social post');
  }

  return toPostResponse({ ...created, media: [] });
}

/**
 * [GET] /workspace/:workspaceId/social-post/:socialPostId
 */
export async function getSocialPost({
  workspaceId,
  socialPostId,
}: {
  workspaceId: string;
  socialPostId: string;
}): Promise<ReturnType<typeof toPostResponse>> {
  const post = await loadOwnedPost({ workspaceId, socialPostId });
  return toPostResponse(post);
}

/**
 * [PATCH] /workspace/:workspaceId/social-post/:socialPostId
 * Edits a draft's content. Only drafts can be edited.
 */
export async function updateSocialPostForUser({
  workspaceId,
  socialPostId,
  content,
}: {
  workspaceId: string;
  socialPostId: string;
  content: string;
}): Promise<SocialPost> {
  const { error, data: updated } = await tryCatch(() =>
    updateSocialPostContent({ id: socialPostId, workspaceId, content }),
  );

  if (error !== null) {
    logger.error('Failed to update social post', error);
    throw new InternalServerErrorException('Failed to update social post');
  }

  if (!updated) {
    throw new NotFoundException('Draft not found');
  }

  return updated;
}

/**
 * [DELETE] /workspace/:workspaceId/social-post/:socialPostId
 * Deletes the row (its social_post_media links cascade with it), then
 * refcount-deletes each attached media (docs/media-library/migration-prd.md
 * decision 5): an image may still be shared by another post or the
 * gen_images row it came from, so only a zero reference count actually
 * removes the R2 object.
 */
export async function deleteSocialPost({
  workspaceId,
  socialPostId,
}: {
  workspaceId: string;
  socialPostId: string;
}): Promise<void> {
  const { error: findError, data: post } = await tryCatch(() =>
    getSocialPostById({ id: socialPostId, workspaceId }),
  );

  if (findError !== null) {
    logger.error('Failed to load social post', findError);
    throw new InternalServerErrorException('Failed to load social post');
  }

  const mediaIds = post?.media.map((item) => item.mediaId) ?? [];

  await deleteSocialPostById({ id: socialPostId, workspaceId });

  await Promise.all(mediaIds.map((mediaId) => deleteMediaIfUnreferenced({ mediaId })));
}

/**
 * [POST] /workspace/:workspaceId/social-post/:socialPostId/media
 * Attaches an image to a draft. Drafts only, JPEG/PNG/GIF only, 10 MB cap,
 * and at most MAX_MEDIA_PER_POST images per post.
 */
export async function attachSocialPostMedia({
  workspaceId,
  socialPostId,
  userId,
  file,
  altText,
}: {
  workspaceId: string;
  socialPostId: string;
  userId: string;
  file: File;
  altText?: string;
}): Promise<SocialPostMediaResponse> {
  const post = await loadOwnedPost({ workspaceId, socialPostId });

  if (post.status !== 'draft') {
    throw new BadRequestException('Only drafts can have images attached');
  }

  if (post.media.length >= MAX_MEDIA_PER_POST) {
    throw new BadRequestException(`A post can have at most ${MAX_MEDIA_PER_POST} images`);
  }

  if (!isAllowedMediaMimeType(file.type)) {
    throw new BadRequestException('Unsupported image type. Use JPEG, PNG, or GIF.');
  }

  if (file.size > MAX_MEDIA_FILE_BYTES) {
    throw new BadRequestException('Image must be 10 MB or smaller');
  }

  const resolvedAltText = altText && altText.length > 0 ? altText : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `social/${userId}/${randomUUID()}.${MEDIA_EXTENSION_BY_MIME_TYPE[file.type]}`;

  const { error: uploadError } = await tryCatch(() =>
    uploadObjectBuffer({ bucketName: config.cfImagesBucketName, key, buffer, contentType: file.type }),
  );

  if (uploadError !== null) {
    logger.error('Failed to upload social post image', uploadError);
    throw new InternalServerErrorException('Failed to upload image');
  }

  const { error: mediaError, data: mediaRow } = await tryCatch(() =>
    createMedia({
      ownerWorkspaceId: workspaceId,
      bucket: config.cfImagesBucketName,
      storageKey: key,
      filename: key.split('/').pop() ?? key,
      mimeType: file.type,
      size: file.size,
      origin: 'uploaded',
    }),
  );

  if (mediaError !== null || !mediaRow) {
    logger.error('Failed to save social post image media row', mediaError);
    throw new InternalServerErrorException('Failed to save image');
  }

  const { error: createError, data: created } = await tryCatch(() =>
    createSocialPostMediaRecords([
      {
        socialPostId: post.id,
        mediaId: mediaRow.id,
        mimeType: file.type,
        origin: 'upload',
        altText: resolvedAltText,
        sortOrder: post.media.length,
      },
    ]),
  );

  const createdMedia = created?.[0];

  if (createError !== null || !createdMedia) {
    logger.error('Failed to save social post image', createError);
    throw new InternalServerErrorException('Failed to save image');
  }

  return toMediaResponse({ ...createdMedia, media: mediaRow });
}

/**
 * [PATCH] /workspace/:workspaceId/social-post/:socialPostId/media/:mediaId
 * Updates an attached image's alt text. Drafts only.
 */
export async function updateSocialPostMediaAltTextForUser({
  workspaceId,
  socialPostId,
  mediaId,
  altText,
}: {
  workspaceId: string;
  socialPostId: string;
  mediaId: string;
  altText: string;
}): Promise<SocialPostMediaResponse> {
  const post = await loadOwnedPost({ workspaceId, socialPostId });

  if (post.status !== 'draft') {
    throw new BadRequestException("Only a draft's images can be edited");
  }

  const { error, data: updated } = await tryCatch(() =>
    updateSocialPostMediaAltText({ id: mediaId, socialPostId: post.id, altText }),
  );

  if (error !== null) {
    logger.error('Failed to update social post image', error);
    throw new InternalServerErrorException('Failed to update image');
  }

  if (!updated) {
    throw new NotFoundException('Image not found');
  }

  // The alt-text update doesn't touch which media row this link points at,
  // so the joined media from the already-loaded post covers the response
  // without a second query.
  const media = post.media.find((item) => item.id === mediaId)?.media;

  if (!media) {
    logger.error(`Media row missing for social post media ${mediaId}`);
    throw new InternalServerErrorException('Failed to update image');
  }

  return toMediaResponse({ ...updated, media });
}

/**
 * [DELETE] /workspace/:workspaceId/social-post/:socialPostId/media/:mediaId
 * Removes the link, then refcount-deletes the underlying media
 * (docs/media-library/migration-prd.md decision 5): unlink first, so the
 * count no longer includes the link being removed.
 */
export async function removeSocialPostMedia({
  workspaceId,
  socialPostId,
  mediaId,
}: {
  workspaceId: string;
  socialPostId: string;
  mediaId: string;
}): Promise<void> {
  const post = await loadOwnedPost({ workspaceId, socialPostId });

  if (post.status !== 'draft') {
    throw new BadRequestException("Only a draft's images can be removed");
  }

  const media = post.media.find((item) => item.id === mediaId);

  if (!media) {
    throw new NotFoundException('Image not found');
  }

  await deleteSocialPostMediaById({ id: mediaId, socialPostId: post.id });
  await deleteMediaIfUnreferenced({ mediaId: media.mediaId });
}

export type PublishSocialPostResult =
  | { linkedinNotConnected: true }
  | { linkedinNotConnected: false; post: SocialPost };

/**
 * [POST] /workspace/:workspaceId/social-post/:socialPostId/publish
 * Publishes a draft (or retries a failed post) to LinkedIn. Synchronous:
 * there is no worker job for this in v1. Attached images, if any, are
 * uploaded to LinkedIn first.
 */
export async function publishSocialPost({
  workspaceId,
  socialPostId,
  userId,
}: {
  workspaceId: string;
  socialPostId: string;
  userId: string;
}): Promise<PublishSocialPostResult> {
  const post = await loadOwnedPost({ workspaceId, socialPostId });

  if (post.status !== 'draft' && post.status !== 'failed') {
    throw new BadRequestException(
      `Only draft or failed posts can be published (current status: ${post.status})`,
    );
  }

  if (post.content.trim().length === 0) {
    throw new BadRequestException('Add some content before publishing');
  }

  const { error: accountError, data: account } = await tryCatch(() =>
    getAccountByUserIdAndProvider({ userId, providerId: 'linkedin' }),
  );

  if (accountError !== null) {
    logger.error('Failed to load LinkedIn account', accountError);
    throw new InternalServerErrorException('Failed to load LinkedIn account');
  }

  if (!account) {
    return { linkedinNotConnected: true };
  }

  const { error: tokenError, data: token } = await tryCatch(() =>
    auth.api.getAccessToken({ body: { providerId: 'linkedin', userId } }),
  );

  if (tokenError !== null || !token?.accessToken) {
    logger.error('Failed to get a valid LinkedIn access token', tokenError);
    await tryCatch(() =>
      markSocialPostFailed({
        id: socialPostId,
        workspaceId,
        publishError: 'Failed to get a valid LinkedIn access token',
      }),
    );
    throw new InternalServerErrorException('Failed to get a valid LinkedIn access token');
  }

  const mediaResult = await uploadPostMediaToLinkedIn({
    media: post.media,
    accessToken: token.accessToken,
    authorId: account.accountId,
  });

  if ('error' in mediaResult) {
    logger.error('Failed to upload post media to LinkedIn', mediaResult.error);
    await tryCatch(() =>
      markSocialPostFailed({ id: socialPostId, workspaceId, publishError: mediaResult.error }),
    );
    throw new InternalServerErrorException('Failed to publish to LinkedIn');
  }

  const linkedin = createLinkedinClient(token.accessToken);

  const { error: publishError, data: published } = await tryCatch(() =>
    linkedin.createPost({
      authorId: account.accountId,
      text: post.content,
      imageUrns: mediaResult.imageUrns,
    }),
  );

  if (publishError !== null || !published) {
    logger.error('Failed to publish to LinkedIn', publishError);
    await tryCatch(() =>
      markSocialPostFailed({
        id: socialPostId,
        workspaceId,
        publishError: publishError?.message ?? 'Failed to publish to LinkedIn',
      }),
    );
    throw new InternalServerErrorException('Failed to publish to LinkedIn');
  }

  const { error: markError, data: publishedPost } = await tryCatch(() =>
    markSocialPostPublished({
      id: socialPostId,
      workspaceId,
      externalId: published.urn,
      externalUrl: published.url,
    }),
  );

  if (markError !== null || !publishedPost) {
    logger.error('Post was published to LinkedIn but failed to save', markError);
    throw new InternalServerErrorException('Post was published but failed to save');
  }

  return { linkedinNotConnected: false, post: publishedPost };
}
