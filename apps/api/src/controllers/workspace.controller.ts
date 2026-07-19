import { Hono } from 'hono';
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
   * Create a new workspace for the authenticated user
   */
  .post('/', validCreateWorkspaceBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const workspace = await createWorkspaceForUser({ userId: user.id, name: body.name });

    return c.json({ workspace }, 201);
  })
  /**
   * [PATCH] /workspace/:workspaceId
   * Rename a workspace owned by the authenticated user
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
   * Delete a workspace owned by the authenticated user. Contained resources
   * (agents, chats, documents, ...) cascade-delete with it. Rejected with
   * 400 if this is the user's only workspace.
   */
  .delete('/:workspaceId', validWorkspaceIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    await deleteWorkspaceForUser({ userId: user.id, workspaceId: param.workspaceId });

    return c.json({ message: 'Workspace deleted successfully' });
  });
