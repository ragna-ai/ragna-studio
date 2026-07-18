import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validCreateFolderBody,
  validRenameFolderBody,
  validWorkspaceFolderParams,
  validWorkspaceIdParam,
} from '../middlewares/validationMiddlewares';
import {
  createFolderForUser,
  deleteFolder,
  listFolders,
  renameFolderForUser,
} from '../services/folder.service';

export const folderController = new Hono()
  .basePath('/workspace')
  .use(authMiddleware)
  /**
   * [GET] /workspace/:workspaceId/folders
   */
  .get('/:workspaceId/folders', validWorkspaceIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const folders = await listFolders({ workspaceId: param.workspaceId, userId: user.id });

    return c.json({ folders });
  })
  /**
   * [POST] /workspace/:workspaceId/folders
   */
  .post('/:workspaceId/folders', validWorkspaceIdParam, validCreateFolderBody, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const folderRecord = await createFolderForUser({
      workspaceId: param.workspaceId,
      userId: user.id,
      name: body.name,
    });

    return c.json({ folder: folderRecord }, 201);
  })
  /**
   * [PATCH] /workspace/:workspaceId/folders/:folderId
   */
  .patch(
    '/:workspaceId/folders/:folderId',
    validWorkspaceFolderParams,
    validRenameFolderBody,
    async (c) => {
      const user = c.get('user');
      const param = c.req.valid('param');
      const body = c.req.valid('json');

      const folderRecord = await renameFolderForUser({
        workspaceId: param.workspaceId,
        userId: user.id,
        folderId: param.folderId,
        name: body.name,
      });

      return c.json({ folder: folderRecord });
    },
  )
  /**
   * [DELETE] /workspace/:workspaceId/folders/:folderId
   * Documents in this folder move to root, they are not deleted.
   */
  .delete('/:workspaceId/folders/:folderId', validWorkspaceFolderParams, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    await deleteFolder({
      workspaceId: param.workspaceId,
      userId: user.id,
      folderId: param.folderId,
    });

    return c.json({ message: 'Folder deleted successfully' });
  });
