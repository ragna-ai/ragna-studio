import { auth } from '@repo/auth/server';
import type { SocialPostMedia, SocialPostWithMedia } from '@repo/database';
import {
  createSocialPost,
  createSocialPostMediaRecords,
  deleteSocialPostById,
  deleteSocialPostMediaById,
  getAccountByUserIdAndProvider,
  getAllSocialPostsByUserId,
  getSocialPostById,
  getSocialPostCountByUserId,
  markSocialPostFailed,
  markSocialPostPublished,
  updateSocialPostContent,
  updateSocialPostMediaAltText,
} from '@repo/database';
import { createLinkedinClient } from '@repo/linkedin';
import { logger } from '@repo/logger';
import { uploadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validCreateSocialPostBody,
  validPaginationQuery,
  validSocialPostIdParam,
  validSocialPostMediaParams,
  validUpdateSocialPostBody,
  validUpdateSocialPostMediaBody,
} from '../middlewares/validationMiddlewares';
import {
  deleteUploadedMediaObjects,
  uploadPostMediaToLinkedIn,
} from '../services/social-post-media.service';

// Returned instead of a generic 400 so the web app can show a
// "connect LinkedIn" hint rather than a plain error toast.
const LINKEDIN_NOT_CONNECTED_ERROR_CODE = 'LINKEDIN_NOT_CONNECTED';

// Same bucket packages/ai's imagen.service.ts uploads generated images to.
// User uploads live under a `social/{userId}/` prefix so they don't collide
// with generated-image keys.
const MEDIA_BUCKET_NAME = 'ragna-cloud-images';
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

// Images are served through the same public CDN domain imagen.service.ts
// uses for generated images, since both live in the same R2 bucket.
function toMediaResponse(media: SocialPostMedia) {
  return {
    ...media,
    imageUrl: `https://images.ragna.app/${media.storageKey}`,
  };
}

function toPostResponse(post: SocialPostWithMedia) {
  return {
    ...post,
    media: post.media.map(toMediaResponse),
  };
}

export const socialPostController = new Hono()
  .basePath('/social-posts')
  .use(authMiddleware)
  /**
   * [GET] /social-posts
   * List the authenticated user's posts, newest first, with their media.
   */
  .get('/', validPaginationQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const sort = query.sort || 'desc';

    // Calculate offset for pagination ((page number - 1) * page size)
    const offset = page && limit ? (page - 1) * limit : undefined;

    // Get all posts count and fail gracefully
    const { data: postsCount } = await tryCatch(() =>
      getSocialPostCountByUserId({ userId: user.id }),
    );

    const { error, data: posts } = await tryCatch(() =>
      getAllSocialPostsByUserId({ userId: user.id, limit, sort, offset }),
    );

    if (error !== null) {
      logger.error('Failed to list social posts', error);
      throw new InternalServerErrorException('Failed to list social posts');
    }

    const meta = {
      totalCount: postsCount || 0,
    };

    return c.json({ posts: posts.map(toPostResponse), meta });
  })
  /**
   * [POST] /social-posts
   * Create a new draft from the web editor. Content may start empty: the
   * user fills it in on the upsert page. Publish rejects empty content.
   */
  .post('/', validCreateSocialPostBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const { error, data: created } = await tryCatch(() =>
      createSocialPost({
        userId: user.id,
        platform: 'linkedin',
        content: body.content,
        source: 'user',
      }),
    );

    if (error !== null || !created) {
      logger.error('Failed to create social post', error);
      throw new InternalServerErrorException('Failed to create social post');
    }

    return c.json({ post: toPostResponse({ ...created, media: [] }) }, 201);
  })
  /**
   * [GET] /social-posts/:id
   * Get a single post by ID, with its media, scoped to the current user.
   */
  .get('/:id', validSocialPostIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: post } = await tryCatch(() =>
      getSocialPostById({ id: param.id, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get social post by ID', error);
      throw new InternalServerErrorException('Failed to get social post by ID');
    }

    if (!post) {
      throw new NotFoundException('Social post not found');
    }

    return c.json({ post: toPostResponse(post) });
  })
  /**
   * [PATCH] /social-posts/:id
   * Edit a draft's content. Only drafts can be edited.
   */
  .patch('/:id', validSocialPostIdParam, validUpdateSocialPostBody, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const { error, data: updated } = await tryCatch(() =>
      updateSocialPostContent({ id: param.id, userId: user.id, content: body.content }),
    );

    if (error !== null) {
      logger.error('Failed to update social post', error);
      throw new InternalServerErrorException('Failed to update social post');
    }

    if (!updated) {
      throw new NotFoundException('Draft not found');
    }

    return c.json({ post: updated });
  })
  /**
   * [DELETE] /social-posts/:id
   * Cleans up any uploaded media objects in R2 before the row (and its
   * media rows, via cascade) is deleted.
   */
  .delete('/:id', validSocialPostIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error: findError, data: post } = await tryCatch(() =>
      getSocialPostById({ id: param.id, userId: user.id }),
    );

    if (findError !== null) {
      logger.error('Failed to load social post', findError);
      throw new InternalServerErrorException('Failed to load social post');
    }

    if (post) {
      await deleteUploadedMediaObjects(post.media);
    }

    await deleteSocialPostById({ id: param.id, userId: user.id });

    return c.json({ message: 'Social post deleted successfully' });
  })
  /**
   * [POST] /social-posts/:id/media
   * Attach an image to a draft. Multipart upload: a `file` field plus an
   * optional `altText` field. Drafts only, JPEG/PNG/GIF only, 10 MB cap, and
   * at most `MAX_MEDIA_PER_POST` images per post.
   */
  .post('/:id/media', validSocialPostIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error: findError, data: post } = await tryCatch(() =>
      getSocialPostById({ id: param.id, userId: user.id }),
    );

    if (findError !== null) {
      logger.error('Failed to load social post', findError);
      throw new InternalServerErrorException('Failed to load social post');
    }

    if (!post) {
      throw new NotFoundException('Social post not found');
    }

    if (post.status !== 'draft') {
      throw new BadRequestException('Only drafts can have images attached');
    }

    if (post.media.length >= MAX_MEDIA_PER_POST) {
      throw new BadRequestException(`A post can have at most ${MAX_MEDIA_PER_POST} images`);
    }

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      throw new BadRequestException('A file is required');
    }

    if (!isAllowedMediaMimeType(file.type)) {
      throw new BadRequestException('Unsupported image type. Use JPEG, PNG, or GIF.');
    }

    if (file.size > MAX_MEDIA_FILE_BYTES) {
      throw new BadRequestException('Image must be 10 MB or smaller');
    }

    const altText =
      typeof body.altText === 'string' && body.altText.length > 0 ? body.altText : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `social/${user.id}/${randomUUID()}.${MEDIA_EXTENSION_BY_MIME_TYPE[file.type]}`;

    const { error: uploadError } = await tryCatch(() =>
      uploadObjectBuffer({ bucketName: MEDIA_BUCKET_NAME, key, buffer, contentType: file.type }),
    );

    if (uploadError !== null) {
      logger.error('Failed to upload social post image', uploadError);
      throw new InternalServerErrorException('Failed to upload image');
    }

    const { error: createError, data: created } = await tryCatch(() =>
      createSocialPostMediaRecords([
        {
          socialPostId: post.id,
          storageKey: key,
          mimeType: file.type,
          origin: 'upload',
          altText,
          sortOrder: post.media.length,
        },
      ]),
    );

    const createdMedia = created?.[0];

    if (createError !== null || !createdMedia) {
      logger.error('Failed to save social post image', createError);
      throw new InternalServerErrorException('Failed to save image');
    }

    return c.json({ media: toMediaResponse(createdMedia) }, 201);
  })
  /**
   * [PATCH] /social-posts/:id/media/:mediaId
   * Update an attached image's alt text. Drafts only.
   */
  .patch(
    '/:id/media/:mediaId',
    validSocialPostMediaParams,
    validUpdateSocialPostMediaBody,
    async (c) => {
      const user = c.get('user');
      const { id, mediaId } = c.req.valid('param');
      const { altText } = c.req.valid('json');

      const { error: findError, data: post } = await tryCatch(() =>
        getSocialPostById({ id, userId: user.id }),
      );

      if (findError !== null) {
        logger.error('Failed to load social post', findError);
        throw new InternalServerErrorException('Failed to load social post');
      }

      if (!post) {
        throw new NotFoundException('Social post not found');
      }

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

      return c.json({ media: toMediaResponse(updated) });
    },
  )
  /**
   * [DELETE] /social-posts/:id/media/:mediaId
   * Removes the media row and, for uploaded (not agent-attached) media,
   * its R2 object too.
   */
  .delete('/:id/media/:mediaId', validSocialPostMediaParams, async (c) => {
    const user = c.get('user');
    const { id, mediaId } = c.req.valid('param');

    const { error: findError, data: post } = await tryCatch(() =>
      getSocialPostById({ id, userId: user.id }),
    );

    if (findError !== null) {
      logger.error('Failed to load social post', findError);
      throw new InternalServerErrorException('Failed to load social post');
    }

    if (!post) {
      throw new NotFoundException('Social post not found');
    }

    if (post.status !== 'draft') {
      throw new BadRequestException("Only a draft's images can be removed");
    }

    const media = post.media.find((item) => item.id === mediaId);

    if (!media) {
      throw new NotFoundException('Image not found');
    }

    await deleteUploadedMediaObjects([media]);
    await deleteSocialPostMediaById({ id: mediaId, socialPostId: post.id });

    return c.json({ message: 'Image removed successfully' });
  })
  /**
   * [POST] /social-posts/:id/publish
   * Publish a draft (or retry a failed post) to LinkedIn. Synchronous:
   * there is no worker job for this in v1. Attached images, if any, are
   * uploaded to LinkedIn first.
   */
  .post('/:id/publish', validSocialPostIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error: findError, data: post } = await tryCatch(() =>
      getSocialPostById({ id: param.id, userId: user.id }),
    );

    if (findError !== null) {
      logger.error('Failed to load social post', findError);
      throw new InternalServerErrorException('Failed to load social post');
    }

    if (!post) {
      throw new NotFoundException('Social post not found');
    }

    if (post.status !== 'draft' && post.status !== 'failed') {
      throw new BadRequestException(
        `Only draft or failed posts can be published (current status: ${post.status})`,
      );
    }

    if (post.content.trim().length === 0) {
      throw new BadRequestException('Add some content before publishing');
    }

    const { error: accountError, data: account } = await tryCatch(() =>
      getAccountByUserIdAndProvider({ userId: user.id, providerId: 'linkedin' }),
    );

    if (accountError !== null) {
      logger.error('Failed to load LinkedIn account', accountError);
      throw new InternalServerErrorException('Failed to load LinkedIn account');
    }

    if (!account) {
      return c.json(
        {
          code: 400,
          error: 'No LinkedIn account connected',
          errorCode: LINKEDIN_NOT_CONNECTED_ERROR_CODE,
        },
        400,
      );
    }

    const { error: tokenError, data: token } = await tryCatch(() =>
      auth.api.getAccessToken({ body: { providerId: 'linkedin', userId: user.id } }),
    );

    if (tokenError !== null || !token?.accessToken) {
      logger.error('Failed to get a valid LinkedIn access token', tokenError);
      await tryCatch(() =>
        markSocialPostFailed({
          id: param.id,
          userId: user.id,
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
        markSocialPostFailed({ id: param.id, userId: user.id, publishError: mediaResult.error }),
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
          id: param.id,
          userId: user.id,
          publishError: publishError?.message ?? 'Failed to publish to LinkedIn',
        }),
      );
      throw new InternalServerErrorException('Failed to publish to LinkedIn');
    }

    const { error: markError, data: publishedPost } = await tryCatch(() =>
      markSocialPostPublished({
        id: param.id,
        userId: user.id,
        externalId: published.urn,
        externalUrl: published.url,
      }),
    );

    if (markError !== null || !publishedPost) {
      logger.error('Post was published to LinkedIn but failed to save', markError);
      throw new InternalServerErrorException('Post was published but failed to save');
    }

    return c.json({ post: publishedPost });
  });
