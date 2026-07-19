import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import { generateImagesForWorkspace, listGenImages } from '../services/imagegen.service';
import { validGenerateImagesBody, validGenImageListQuery } from '../validation';

export const genImageController = new Hono()
  .basePath('/workspace/:workspaceId/gen-image')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/gen-image
   * List the workspace's generated images, paginated, newest first by default.
   */
  .get('/', validGenImageListQuery, async (c) => {
    const workspace = c.get('workspace');
    const query = c.req.valid('query');

    const { genImages, meta } = await listGenImages({
      workspaceId: workspace.id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });

    return c.json({ genImages, meta });
  })
  /**
   * [POST] /workspace/:workspaceId/gen-image
   * Generate image(s) from a prompt and persist them in the workspace.
   */
  .post('/', validGenerateImagesBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const { genImages } = await generateImagesForWorkspace({
      userId: user.id,
      workspaceId: workspace.id,
      input: body,
    });

    return c.json({ genImages }, 201);
  });
