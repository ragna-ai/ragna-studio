import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  createDocumentForUser,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocumentForUser,
} from '../services/document.service';
import { validCreateDocumentBody, validDocumentIdParam, validUpdateDocumentBody } from '../validation';

export const documentController = new Hono()
  .basePath('/workspace/:workspaceId/document')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/document
   * List a workspace's documents, most recently updated first.
   */
  .get('/', async (c) => {
    const workspace = c.get('workspace');

    const documents = await listDocuments({ workspaceId: workspace.id });

    return c.json({ documents });
  })
  /**
   * [POST] /workspace/:workspaceId/document
   * Create a document. Human-created: sets createdByUserId.
   */
  .post('/', validCreateDocumentBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const documentRecord = await createDocumentForUser({
      workspaceId: workspace.id,
      userId: user.id,
      title: body.title,
      content: body.content,
      folderId: body.folderId,
    });

    return c.json({ document: documentRecord }, 201);
  })
  /**
   * [GET] /workspace/:workspaceId/document/:documentId
   */
  .get('/:documentId', validDocumentIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const documentRecord = await getDocument({
      workspaceId: workspace.id,
      documentId: param.documentId,
    });

    return c.json({ document: documentRecord });
  })
  /**
   * [PATCH] /workspace/:workspaceId/document/:documentId
   * Updates title/content/folderId. Also doubles as the autosave endpoint
   * (debounced client-side): last writer wins, no conflict detection in v1.
   */
  .patch('/:documentId', validDocumentIdParam, validUpdateDocumentBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const documentRecord = await updateDocumentForUser({
      workspaceId: workspace.id,
      documentId: param.documentId,
      title: body.title,
      content: body.content,
      folderId: body.folderId,
    });

    return c.json({ document: documentRecord });
  })
  /**
   * [DELETE] /workspace/:workspaceId/document/:documentId
   */
  .delete('/:documentId', validDocumentIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteDocument({
      workspaceId: workspace.id,
      documentId: param.documentId,
    });

    return c.json({ message: 'Document deleted successfully' });
  });
