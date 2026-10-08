import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  createDocumentForUser,
  deleteDocument,
  exportDocument,
  getDocument,
  listDocuments,
  updateDocumentForUser,
} from '../services/document.service';
import { buildAttachmentContentDisposition } from '../utils/content-disposition';
import {
  validCreateDocumentBody,
  validDocumentExportQuery,
  validDocumentIdParam,
  validUpdateDocumentBody,
} from '../validation';

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

    return c.json({ document: documentRecord }, StatusCodes.CREATED);
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
  })
  /**
   * [GET] /workspace/:workspaceId/document/:documentId/export
   * Downloads the document as Markdown, plain text, PDF, or Word (docx)
   * (specs/datasets/export-and-row-reorder.md "Document export").
   */
  .get('/:documentId/export', validDocumentIdParam, validDocumentExportQuery, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const query = c.req.valid('query');

    const file = await exportDocument({
      workspaceId: workspace.id,
      documentId: param.documentId,
      format: query.format,
    });

    return c.body(new Uint8Array(file.bytes), 200, {
      'Content-Type': file.contentType,
      'Content-Disposition': buildAttachmentContentDisposition(file.filename),
    });
  });
