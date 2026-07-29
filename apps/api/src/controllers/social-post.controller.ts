import { Hono } from 'hono';
import { BadRequestException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  attachSocialPostMedia,
  createSocialPostForUser,
  deleteSocialPost,
  getSocialPost,
  LINKEDIN_NOT_CONNECTED_ERROR_CODE,
  listSocialPosts,
  publishSocialPost,
  removeSocialPostMedia,
  updateSocialPostForUser,
  updateSocialPostMediaAltTextForUser,
} from '../services/social-post.service';
import {
  validCreateSocialPostBody,
  validPaginationQuery,
  validSocialPostIdParam,
  validSocialPostMediaParams,
  validUpdateSocialPostBody,
  validUpdateSocialPostMediaBody,
} from '../validation';

export const socialPostController = new Hono()
  .basePath('/workspace/:workspaceId/social-post')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/social-post
   * Lists the workspace's posts with their media, paginated.
   */
  .get('/', validPaginationQuery, async (c) => {
    const workspace = c.get('workspace');
    const query = c.req.valid('query');

    const { posts, meta } = await listSocialPosts({
      workspaceId: workspace.id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });

    return c.json({ posts, meta });
  })
  /**
   * [POST] /workspace/:workspaceId/social-post
   * Creates a new draft from the web editor. Content may start empty: the
   * user fills it in on the upsert page. Publish rejects empty content.
   */
  .post('/', validCreateSocialPostBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const post = await createSocialPostForUser({
      workspaceId: workspace.id,
      userId: user.id,
      content: body.content,
    });

    return c.json({ post }, 201);
  })
  /**
   * [GET] /workspace/:workspaceId/social-post/:socialPostId
   */
  .get('/:socialPostId', validSocialPostIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const post = await getSocialPost({
      workspaceId: workspace.id,
      socialPostId: param.socialPostId,
    });

    return c.json({ post });
  })
  /**
   * [PATCH] /workspace/:workspaceId/social-post/:socialPostId
   * Edits a draft's content. Only drafts can be edited.
   */
  .patch('/:socialPostId', validSocialPostIdParam, validUpdateSocialPostBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const post = await updateSocialPostForUser({
      workspaceId: workspace.id,
      socialPostId: param.socialPostId,
      content: body.content,
    });

    return c.json({ post });
  })
  /**
   * [DELETE] /workspace/:workspaceId/social-post/:socialPostId
   * Cleans up any uploaded media objects in R2 before the row (and its
   * media rows, via cascade) is deleted.
   */
  .delete('/:socialPostId', validSocialPostIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteSocialPost({ workspaceId: workspace.id, socialPostId: param.socialPostId });

    return c.json({ message: 'Social post deleted successfully' });
  })
  /**
   * [POST] /workspace/:workspaceId/social-post/:socialPostId/media
   * Attaches an image to a draft. Multipart upload: a `file` field plus an
   * optional `altText` field. Drafts only, JPEG/PNG/GIF only, 10 MB cap, and
   * at most 9 images per post (enforced in the service).
   */
  .post('/:socialPostId/media', validSocialPostIdParam, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      throw new BadRequestException('A file is required');
    }

    const altText = typeof body.altText === 'string' ? body.altText : undefined;

    const media = await attachSocialPostMedia({
      workspaceId: workspace.id,
      socialPostId: param.socialPostId,
      userId: user.id,
      file,
      altText,
    });

    return c.json({ media }, 201);
  })
  /**
   * [PATCH] /workspace/:workspaceId/social-post/:socialPostId/media/:mediaId
   * Updates an attached image's alt text. Drafts only.
   */
  .patch(
    '/:socialPostId/media/:mediaId',
    validSocialPostMediaParams,
    validUpdateSocialPostMediaBody,
    async (c) => {
      const workspace = c.get('workspace');
      const { socialPostId, mediaId } = c.req.valid('param');
      const { altText } = c.req.valid('json');

      const media = await updateSocialPostMediaAltTextForUser({
        workspaceId: workspace.id,
        socialPostId,
        mediaId,
        altText,
      });

      return c.json({ media });
    },
  )
  /**
   * [DELETE] /workspace/:workspaceId/social-post/:socialPostId/media/:mediaId
   * Removes the media row and, for uploaded (not agent-attached) media, its
   * R2 object too.
   */
  .delete('/:socialPostId/media/:mediaId', validSocialPostMediaParams, async (c) => {
    const workspace = c.get('workspace');
    const { socialPostId, mediaId } = c.req.valid('param');

    await removeSocialPostMedia({ workspaceId: workspace.id, socialPostId, mediaId });

    return c.json({ message: 'Image removed successfully' });
  })
  /**
   * [POST] /workspace/:workspaceId/social-post/:socialPostId/publish
   * Publishes a draft (or retries a failed post) to LinkedIn.
   */
  .post('/:socialPostId/publish', validSocialPostIdParam, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const result = await publishSocialPost({
      workspaceId: workspace.id,
      socialPostId: param.socialPostId,
      userId: user.id,
    });

    if (result.linkedinNotConnected) {
      // Returned instead of a generic 400 so the web app can show a
      // "connect LinkedIn" hint rather than a plain error toast.
      return c.json(
        {
          code: 400,
          error: 'No LinkedIn account connected',
          errorCode: LINKEDIN_NOT_CONNECTED_ERROR_CODE,
        },
        400,
      );
    }

    return c.json({ post: result.post });
  });
