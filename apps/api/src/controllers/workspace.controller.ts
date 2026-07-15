import {
  createWorkspace,
  deleteWorkspaceById,
  getAllWorkspacesByOwnerId,
  updateWorkspace,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import { InternalServerErrorException, NotFoundException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validCreateWorkspaceBody,
  validRenameWorkspaceBody,
  validWorkspaceIdParam,
} from '../middlewares/validationMiddlewares';

export const workspaceController = new Hono()
  .basePath('/workspace')
  .use(authMiddleware)
  /**
   * [GET] /workspace
   * Get all workspaces owned by the authenticated user
   */
  .get('/', async (c) => {
    const user = c.get('user');

    const { error, data: workspaces } = await tryCatch(() =>
      getAllWorkspacesByOwnerId({ ownerId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get workspaces for user', error);
      throw new InternalServerErrorException('Failed to get workspaces for user');
    }

    return c.json({ workspaces });
  })
  /**
   * [POST] /workspace
   * Create a new workspace for the authenticated user
   */
  .post('/', validCreateWorkspaceBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const { error, data: workspace } = await tryCatch(() =>
      createWorkspace({ ownerId: user.id, name: body.name }),
    );

    if (error !== null) {
      logger.error('Failed to create workspace', error);
      throw new InternalServerErrorException('Failed to create workspace');
    }

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

    const { error, data: workspace } = await tryCatch(() =>
      updateWorkspace({ id: param.workspaceId, ownerId: user.id, name: body.name }),
    );

    if (error !== null) {
      logger.error('Failed to rename workspace', error);
      throw new InternalServerErrorException('Failed to rename workspace');
    }

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return c.json({ workspace });
  })
  /**
   * [DELETE] /workspace/:workspaceId
   * Delete a workspace owned by the authenticated user. Resources that were
   * in it fall back to unassigned (workspaceId set to null), never deleted.
   */
  .delete('/:workspaceId', validWorkspaceIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    await deleteWorkspaceById({ id: param.workspaceId, ownerId: user.id });

    return c.json({ message: 'Workspace deleted successfully' });
  });
