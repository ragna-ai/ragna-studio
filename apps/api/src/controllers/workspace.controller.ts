import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  createWorkspaceForUser,
  deleteWorkspaceForUser,
  listWorkspacesForUser,
  renameWorkspaceForUser,
} from '../services/workspace.service';
import {
  validCreateWorkspaceBody,
  validRenameWorkspaceBody,
  validWorkspaceIdParam,
} from '../validation';

export const workspaceController = new Hono()
  .basePath('/workspace')
  .use(authMiddleware)
  /**
   * [GET] /workspace
   * Get all workspaces owned by the authenticated user
   */
  .get('/', async (c) => {
    const user = c.get('user');

    const workspaces = await listWorkspacesForUser({ userId: user.id });

    return c.json({ workspaces });
  })
  /**
   * [POST] /workspace
   * Create an organization or restricted workspace; the caller becomes its manager
   */
  .post('/', validCreateWorkspaceBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const workspace = await createWorkspaceForUser({
      userId: user.id,
      name: body.name,
      visibility: body.visibility,
      memberUserIds: body.memberUserIds,
    });

    return c.json({ workspace }, StatusCodes.CREATED);
  })
  /**
   * [PATCH] /workspace/:workspaceId
   * Rename a workspace. Workspace managers only
   */
  .patch('/:workspaceId', validWorkspaceIdParam, validRenameWorkspaceBody, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const workspace = await renameWorkspaceForUser({
      userId: user.id,
      workspaceId: param.workspaceId,
      name: body.name,
    });

    return c.json({ workspace });
  })
  /**
   * [DELETE] /workspace/:workspaceId
   * Delete a workspace. Workspace managers only. Contained resources
   * (agents, chats, documents, ...) cascade-delete with it. Personal workspaces: 400.
   */
  .delete('/:workspaceId', validWorkspaceIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    await deleteWorkspaceForUser({ userId: user.id, workspaceId: param.workspaceId });

    return c.json({ message: 'Workspace deleted successfully' });
  });
