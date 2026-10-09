import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import { downloadMedia, listMediaForWorkspace } from '../services/media.service';
import { buildAttachmentContentDisposition } from '../utils/content-disposition';
import { validMediaIdParam } from '../validation';

export const mediaController = new Hono()
  .basePath('/workspace/:workspaceId/media')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/media
   * Lists the workspace's media, newest first. Powers pickers like the
   * email compose media-library attachment picker.
   */
  .get('/', async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const media = await listMediaForWorkspace({ userId: user.id, workspaceId: workspace.id });
    return c.json({ media });
  })
  /**
   * [GET] /workspace/:workspaceId/media/:mediaId/download
   * Streams a workspace-owned media object from R2 with its content-type
   * and a content-disposition filename. Images also have a public CDN URL
   * (@repo/media's toChatUploadImageUrl); every other kind lives in
   * the private documents bucket and is only reachable through this route.
   */
  .get('/:mediaId/download', validMediaIdParam, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const file = await downloadMedia({
      userId: user.id,
      workspaceId: workspace.id,
      mediaId: param.mediaId,
    });

    return c.body(new Uint8Array(file.bytes), 200, {
      'Content-Type': file.contentType,
      'Content-Disposition': buildAttachmentContentDisposition(file.filename),
    });
  });
