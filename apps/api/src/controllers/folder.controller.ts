import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  createFolderForUser,
  deleteFolder,
  listFolders,
  renameFolderForUser,
} from '../services/folder.service';
import { validCreateFolderBody, validFolderIdParam, validRenameFolderBody } from '../validation';

export const folderController = new Hono()
  .basePath('/workspace/:workspaceId/folder')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/folder
   * Lists every folder in the workspace. Not paginated: folders are a small,
   * naturally bounded collection (docs/api-standards/prd.md, "Pagination").
   */
  .get('/', async (c) => {
    const workspace = c.get('workspace');

    const folders = await listFolders({ workspaceId: workspace.id });

    return c.json({ folders });
  })
  /**
   * [POST] /workspace/:workspaceId/folder
   */
  .post('/', validCreateFolderBody, async (c) => {
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const folderRecord = await createFolderForUser({
      workspaceId: workspace.id,
      name: body.name,
    });

    return c.json({ folder: folderRecord }, 201);
  })
  /**
   * [PATCH] /workspace/:workspaceId/folder/:folderId
   */
  .patch('/:folderId', validFolderIdParam, validRenameFolderBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const folderRecord = await renameFolderForUser({
      workspaceId: workspace.id,
      folderId: param.folderId,
      name: body.name,
    });

    return c.json({ folder: folderRecord });
  })
  /**
   * [DELETE] /workspace/:workspaceId/folder/:folderId
   * Documents in this folder move to root, they are not deleted.
   */
  .delete('/:folderId', validFolderIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteFolder({
      workspaceId: workspace.id,
      folderId: param.folderId,
    });

    return c.json({ message: 'Folder deleted successfully' });
  });
