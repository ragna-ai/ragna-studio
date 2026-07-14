import { auth } from '@repo/auth/server';
import {
  deleteSocialPostById,
  getAccountByUserIdAndProvider,
  getAllSocialPostsByUserId,
  getSocialPostById,
  markSocialPostFailed,
  markSocialPostPublished,
  updateSocialPostContent,
} from '@repo/database';
import { createLinkedinClient } from '@repo/linkedin';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validSocialPostIdParam,
  validUpdateSocialPostBody,
} from '../middlewares/validationMiddlewares';

// Returned instead of a generic 400 so the web app can show a
// "connect LinkedIn" hint rather than a plain error toast.
const LINKEDIN_NOT_CONNECTED_ERROR_CODE = 'LINKEDIN_NOT_CONNECTED';

export const socialPostController = new Hono()
  .basePath('/social-posts')
  .use(authMiddleware)
  /**
   * [GET] /social-posts
   * List the authenticated user's posts, newest first
   */
  .get('/', async (c) => {
    const user = c.get('user');

    const { error, data: posts } = await tryCatch(() =>
      getAllSocialPostsByUserId({ userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to list social posts', error);
      throw new InternalServerErrorException('Failed to list social posts');
    }

    return c.json({ posts });
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
   */
  .delete('/:id', validSocialPostIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    await deleteSocialPostById({ id: param.id, userId: user.id });

    return c.json({ message: 'Social post deleted successfully' });
  })
  /**
   * [POST] /social-posts/:id/publish
   * Publish a draft (or retry a failed post) to LinkedIn. Synchronous:
   * there is no worker job for this in v1.
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

    const linkedin = createLinkedinClient(token.accessToken);

    const { error: publishError, data: published } = await tryCatch(() =>
      linkedin.createTextPost({ authorId: account.accountId, text: post.content }),
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
