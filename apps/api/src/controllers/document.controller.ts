import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validCreateDocumentBody,
  validUpdateDocumentBody,
  validWorkspaceDocumentParams,
  validWorkspaceIdParam,
} from '../middlewares/validationMiddlewares';
import {
  createDocumentForUser,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocumentForUser,
} from '../services/document.service';

export const documentController = new Hono()
  .basePath('/workspace')
  .use(authMiddleware)
  /**
   * [GET] /workspace/:workspaceId/documents
   * List a workspace's documents, most recently updated first.
   */
  .get('/:workspaceId/documents', validWorkspaceIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const documents = await listDocuments({ workspaceId: param.workspaceId, userId: user.id });

    return c.json({ documents });
  })
  /**
   * [POST] /workspace/:workspaceId/documents
   * Create a document. Human-created: sets createdByUserId.
   */
  .post('/:workspaceId/documents', validWorkspaceIdParam, validCreateDocumentBody, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const documentRecord = await createDocumentForUser({
      workspaceId: param.workspaceId,
      userId: user.id,
      title: body.title,
      content: body.content,
      folderId: body.folderId,
    });

    return c.json({ document: documentRecord }, 201);
  })
  /**
   * [GET] /workspace/:workspaceId/documents/:documentId
   */
  .get('/:workspaceId/documents/:documentId', validWorkspaceDocumentParams, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const documentRecord = await getDocument({
      workspaceId: param.workspaceId,
      userId: user.id,
      documentId: param.documentId,
    });

    return c.json({ document: documentRecord });
  })
  /**
   * [PATCH] /workspace/:workspaceId/documents/:documentId
   * Updates title/content/folderId. Also doubles as the autosave endpoint
   * (debounced client-side): last writer wins, no conflict detection in v1.
   */
  .patch(
    '/:workspaceId/documents/:documentId',
    validWorkspaceDocumentParams,
    validUpdateDocumentBody,
    async (c) => {
      const user = c.get('user');
      const param = c.req.valid('param');
      const body = c.req.valid('json');

      const documentRecord = await updateDocumentForUser({
        workspaceId: param.workspaceId,
        userId: user.id,
        documentId: param.documentId,
        title: body.title,
        content: body.content,
        folderId: body.folderId,
      });

      return c.json({ document: documentRecord });
    },
  )
  /**
   * [DELETE] /workspace/:workspaceId/documents/:documentId
   */
  .delete('/:workspaceId/documents/:documentId', validWorkspaceDocumentParams, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    await deleteDocument({
      workspaceId: param.workspaceId,
      userId: user.id,
      documentId: param.documentId,
    });

    return c.json({ message: 'Document deleted successfully' });
  });
