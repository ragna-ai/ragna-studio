import { config } from '@repo/config';
import type {
  IntegrationConnection,
  Media,
  SocialPost,
  SocialPostMedia,
  SocialPostMediaWithMedia,
  SocialPostWithMedia,
} from '@repo/database';
import type { SocialPlatform, SocialPostSource, SocialPostStatus } from '@repo/database/schema';
import {
  createMedia,
  createSocialPost,
  claimSocialPostForPublishing,
  createSocialPostMediaRecords,
  deleteSocialPostById,
  deleteSocialPostMediaById,
  getAllSocialPostsByWorkspaceId,
  getSocialPostById,
  getSocialPostCountByWorkspaceId,
  markSocialPostFailed,
  markSocialPostPublished,
  releaseSocialPostClaim,
  updateSocialPostContent,
  updateSocialPostMediaAltText,
} from '@repo/database';
import { ConnectionNeedsReauthError, flagConnectionNeedsReauth } from '@repo/integrations';
import {
  LinkedinPublishError,
  resolveUserLinkedinPublisher,
  type LinkedinPost,
  type LinkedinPublisherOptions,
} from '@repo/integrations/social';
import { logger } from '@repo/logger';
import { deleteMediaIfUnreferenced } from '@repo/media';
import { toPublicMediaUrl, uploadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  SocialPostPublishingException,
} from '../exceptions';
import { MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_FILE_MB } from '../utils/upload-limits';
import { uploadSocialPostImages } from './social-post-media.service';

// Same bucket packages/ai's imagen.service.ts uploads generated images to
// (config.s3ImagesBucketName). User uploads live under a `social/{userId}/`
// prefix so they don't collide with generated-image keys.
const MAX_MEDIA_PER_POST = 9;

// A `publishing` post untouched this long is a crashed publish and may be claimed again.
const PUBLISH_CLAIM_STALE_AFTER_MS = 15 * 60 * 1000;

const MEDIA_EXTENSION_BY_MIME_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
} as const;
type AllowedMediaMimeType = keyof typeof MEDIA_EXTENSION_BY_MIME_TYPE;

function isAllowedMediaMimeType(mimeType: string): mimeType is AllowedMediaMimeType {
  return mimeType in MEDIA_EXTENSION_BY_MIME_TYPE;
}

// storageKey lives on the joined media row now, not directly on
// social_post_media; added back onto the
// flat response here since the frontend DTO still expects it alongside
// mediaId (external DTOs unchanged). Field set matches the frontend's
// SocialPostMedia interface (useSocialPostApi.ts) exactly: workspace-internal
// columns (socialPostId, mediaId, origin, timestamps) stay server-side.
export interface SocialPostMediaResponse {
  id: string;
  storageKey: string;
  mimeType: string;
  altText: string | null;
  sortOrder: number;
  imageUrl: string;
}

// Takes the link row and its joined media row as two separate parameters
// instead of one `SocialPostMediaWithMedia`, so a call site with only the
// link row and a separately-fetched media row (attachSocialPostMedia,
// updateSocialPostMediaAltTextForUser) never has to fake the joined shape
// with `{ ...row, media }`.
function toMediaResponse(row: SocialPostMedia, media: Media): SocialPostMediaResponse {
  return {
    id: row.id,
    storageKey: media.storageKey,
    mimeType: row.mimeType,
    altText: row.altText,
    sortOrder: row.sortOrder,
    imageUrl: toPublicMediaUrl(media.storageKey),
  };
}

// Field set matches the frontend's SocialPost interface (useSocialPostApi.ts)
// exactly: userId, workspaceId and deletedAt stay server-side.
export interface SocialPostConnectionResponse {
  id: string;
  externalEmail: string | null;
  displayName: string | null;
}

export interface SocialPostResponse {
  id: string;
  platform: SocialPlatform;
  content: string;
  status: SocialPostStatus;
  source: SocialPostSource;
  externalId: string | null;
  externalUrl: string | null;
  publishedAt: Date | null;
  publishError: string | null;
  createdAt: Date;
  updatedAt: Date;
  media: SocialPostMediaResponse[];
  connection: SocialPostConnectionResponse | null;
}

// Takes the post row and its media rows as two separate parameters instead
// of one `SocialPostWithMedia`, so a call site whose post and media come
// from different queries (publishSocialPost re-uses media loaded earlier;
// createSocialPostForUser has none yet) never has to fake the joined shape
// with `{ ...post, media }`.
function toPostResponse(
  post: SocialPost,
  media: SocialPostMediaWithMedia[],
  connection: SocialPostConnectionResponse | null,
): SocialPostResponse {
  return {
    id: post.id,
    platform: post.platform,
    content: post.content,
    status: post.status,
    source: post.source,
    externalId: post.externalId,
    externalUrl: post.externalUrl,
    publishedAt: post.publishedAt,
    publishError: post.publishError,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    media: media.map((item) => toMediaResponse(item, item.media)),
    connection: connection && {
      id: connection.id,
      externalEmail: connection.externalEmail,
      displayName: connection.displayName,
    },
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
  posts: SocialPostResponse[];
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
    posts: posts.map((post) => toPostResponse(post, post.media, post.connection)),
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
}): Promise<SocialPostResponse> {
  const { error, data: created } = await tryCatch(() =>
    createSocialPost({ userId, workspaceId, platform: 'linkedin', content, source: 'user' }),
  );

  if (error !== null || !created) {
    logger.error('Failed to create social post', error);
    throw new InternalServerErrorException('Failed to create social post');
  }

  return toPostResponse(created, [], null);
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
}): Promise<SocialPostResponse> {
  const post = await loadOwnedPost({ workspaceId, socialPostId });
  return toPostResponse(post, post.media, post.connection);
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
}): Promise<SocialPostResponse> {
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

  // updateSocialPostContent only writes the content column and has no media
  // join, so the response is built from a fresh read instead (matches the
  // re-read pattern in videogen.service.ts's generateVideoForWorkspace).
  const post = await loadOwnedPost({ workspaceId, socialPostId });
  return toPostResponse(post, post.media, post.connection);
}

/**
 * [DELETE] /workspace/:workspaceId/social-post/:socialPostId
 * Deletes the row (its social_post_media links cascade with it), then
 * refcount-deletes each attached media:
 * an image may still be shared by another post or the
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

  if (post?.status === 'publishing') {
    throw new SocialPostPublishingException();
  }

  const mediaIds = post?.media.map((item) => item.mediaId) ?? [];

  await deleteSocialPostById({ id: socialPostId, workspaceId });

  await deleteMediaIfUnreferenced({ mediaIds });
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

  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    throw new BadRequestException(`Image must be ${MAX_UPLOAD_FILE_MB} MB or smaller`);
  }

  const resolvedAltText = altText && altText.length > 0 ? altText : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `social/${userId}/${randomUUID()}.${MEDIA_EXTENSION_BY_MIME_TYPE[file.type]}`;

  const { error: uploadError } = await tryCatch(() =>
    uploadObjectBuffer({
      bucketName: config.s3ImagesBucketName,
      key,
      buffer,
      contentType: file.type,
    }),
  );

  if (uploadError !== null) {
    logger.error('Failed to upload social post image', uploadError);
    throw new InternalServerErrorException('Failed to upload image');
  }

  const { error: mediaError, data: mediaRow } = await tryCatch(() =>
    createMedia({
      ownerWorkspaceId: workspaceId,
      bucket: config.s3ImagesBucketName,
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

  return toMediaResponse(createdMedia, mediaRow);
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

  return toMediaResponse(updated, media);
}

/**
 * [DELETE] /workspace/:workspaceId/social-post/:socialPostId/media/:mediaId
 * Removes the link, then refcount-deletes the underlying media:
 * unlink first, so the
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
  await deleteMediaIfUnreferenced({ mediaIds: [media.mediaId] });
}

export type PublishSocialPostResult =
  | { linkedinNotConnected: true }
  | { linkedinNotConnected: false; post: SocialPostResponse };

export interface PublishSocialPostParams {
  workspaceId: string;
  socialPostId: string;
  userId: string;
  /** Waits between LinkedIn retries and status polls. Tests pass a recorder. */
  sleep?: LinkedinPublisherOptions['sleep'];
}

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
  sleep,
}: PublishSocialPostParams): Promise<PublishSocialPostResult> {
  const post = await loadOwnedPost({ workspaceId, socialPostId });

  if (post.status === 'published') {
    throw new BadRequestException('Only draft or failed posts can be published');
  }

  if (post.content.trim().length === 0) {
    throw new BadRequestException('Add some content before publishing');
  }

  const claimed = await claimSocialPostForPublishing({
    id: socialPostId,
    workspaceId,
    staleBefore: new Date(Date.now() - PUBLISH_CLAIM_STALE_AFTER_MS),
  });

  if (!claimed) {
    throw new SocialPostPublishingException();
  }

  const previousStatus = post.status === 'publishing' ? 'failed' : post.status;
  const restoreStatus = () =>
    tryCatch(() =>
      releaseSocialPostClaim({ id: socialPostId, workspaceId, status: previousStatus }),
    );

  const sent = await sendPostToLinkedin({ post, userId, sleep }).catch(async (error: unknown) => {
    await restoreStatus();
    throw error;
  });

  if (sent.linkedinNotConnected) {
    await restoreStatus();
    return { linkedinNotConnected: true };
  }

  // LinkedIn has the post now: the claim is never released from here on, or a second publish would post it twice.
  const { error: markError, data: publishedPost } = await tryCatch(() =>
    markSocialPostPublished({
      id: socialPostId,
      workspaceId,
      connectionId: sent.connection.id,
      externalId: sent.published.id,
      externalUrl: sent.published.url,
    }),
  );

  if (markError !== null || !publishedPost) {
    logger.error('Post was published to LinkedIn but failed to save', {
      socialPostId,
      linkedinPostId: sent.published.id,
      linkedinPostUrl: sent.published.url,
      error: markError,
    });
    throw new InternalServerErrorException('Post was published but failed to save');
  }

  // Publishing only changes status/externalId/externalUrl/publishedAt; it
  // never touches social_post_media, so the media already loaded at the top
  // of this function (`post.media`) is still accurate, no re-read needed.
  return {
    linkedinNotConnected: false,
    post: toPostResponse(publishedPost, post.media, sent.connection),
  };
}

type SendPostOutcome =
  | { linkedinNotConnected: true }
  | { linkedinNotConnected: false; published: LinkedinPost; connection: IntegrationConnection };

interface SendPostToLinkedinParams {
  post: SocialPostWithMedia;
  userId: string;
  sleep: PublishSocialPostParams['sleep'];
}

/** Everything up to LinkedIn accepting the post. Anything thrown here happened before LinkedIn had it. */
async function sendPostToLinkedin({
  post,
  userId,
  sleep,
}: SendPostToLinkedinParams): Promise<SendPostOutcome> {
  const { id: socialPostId, workspaceId } = post;

  const { error: resolveError, data: resolved } = await tryCatch(() =>
    resolveUserLinkedinPublisher({ userId, sleep }),
  );

  if (resolveError !== null || !resolved) {
    logger.error('Failed to load the LinkedIn connection', resolveError);
    throw new InternalServerErrorException('Failed to load the LinkedIn connection');
  }

  if (resolved.status !== 'ready') {
    return { linkedinNotConnected: true };
  }

  const { publisher, connection } = resolved;

  const { error: publishError, data: published } = await tryCatch(async () => {
    const images = await uploadSocialPostImages({ publisher, media: post.media });
    return publisher.publishPost({ text: post.content, images });
  });

  if (publishError instanceof ConnectionNeedsReauthError) {
    return { linkedinNotConnected: true };
  }

  if (publishError instanceof LinkedinPublishError && publishError.kind === 'auth') {
    await tryCatch(() =>
      flagConnectionNeedsReauth({ connectionId: connection.id, reason: 'access_rejected' }),
    );
    return { linkedinNotConnected: true };
  }

  if (publishError !== null || !published) {
    logger.error('Failed to publish to LinkedIn', publishError);
    await tryCatch(() =>
      markSocialPostFailed({
        id: socialPostId,
        workspaceId,
        publishError:
          publishError instanceof LinkedinPublishError
            ? publishError.message
            : 'Failed to publish to LinkedIn',
      }),
    );
    throw new InternalServerErrorException('Failed to publish to LinkedIn');
  }

  return { linkedinNotConnected: false, published, connection };
}
