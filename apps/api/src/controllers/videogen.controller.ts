import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { BadRequestException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  deleteGenVideo,
  enhanceGenVideoForWorkspace,
  generateVideoForWorkspace,
  listGenVideos,
  uploadGenVideoFrame,
} from '../services/videogen.service';
import {
  validGenerateVideoBody,
  validGenVideoIdParam,
  validGenVideoListQuery,
} from '../validation';

export const genVideoController = new Hono()
  .basePath('/workspace/:workspaceId/gen-video')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/gen-video
   * List the workspace's generated videos, paginated, newest first by default.
   */
  .get('/', validGenVideoListQuery, async (c) => {
    const workspace = c.get('workspace');
    const query = c.req.valid('query');

    const { genVideos, meta } = await listGenVideos({
      workspaceId: workspace.id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });

    return c.json({ genVideos, meta });
  })
  /**
   * [POST] /workspace/:workspaceId/gen-video
   * Requests a video generation from a prompt, optionally animating a
   * first-frame image. Returns the pending row immediately; a worker job
   * renders the clip (docs/videogen/prd.md).
   */
  .post('/', validGenerateVideoBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const { genVideo } = await generateVideoForWorkspace({
      userId: user.id,
      workspaceId: workspace.id,
      input: body,
    });

    return c.json({ genVideo }, StatusCodes.CREATED);
  })
  /**
   * [POST] /workspace/:workspaceId/gen-video/frame-upload
   * Uploads a first-frame image ahead of an image-to-video request.
   * Multipart upload: a `file` field. PNG/JPEG/WEBP only, 10 MB cap.
   */
  .post('/frame-upload', async (c) => {
    const user = c.get('user');

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      throw new BadRequestException('A file is required');
    }

    const { storageKey } = await uploadGenVideoFrame({ userId: user.id, file });

    return c.json({ storageKey }, StatusCodes.CREATED);
  })
  /**
   * [POST] /workspace/:workspaceId/gen-video/:genVideoId/enhance
   * Re-renders a completed BFL draft at full quality as a new pending row
   * (docs/videogen/prd-v2.md). One enhance per draft; a failed enhance may
   * be retried.
   */
  .post('/:genVideoId/enhance', validGenVideoIdParam, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const { genVideo } = await enhanceGenVideoForWorkspace({
      genVideoId: param.genVideoId,
      userId: user.id,
      workspaceId: workspace.id,
    });

    return c.json({ genVideo }, StatusCodes.CREATED);
  })
  /**
   * [DELETE] /workspace/:workspaceId/gen-video/:genVideoId
   */
  .delete('/:genVideoId', validGenVideoIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteGenVideo({ workspaceId: workspace.id, genVideoId: param.genVideoId });

    return c.json({ message: 'Generated video deleted successfully' });
  });
