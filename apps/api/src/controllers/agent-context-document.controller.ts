import { Hono } from 'hono';
import { BadRequestException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validAgentContextDocumentParams,
  validAgentIdParam,
  validRenameAgentContextDocumentBody,
} from '../middlewares/validationMiddlewares';
import {
  deleteAgentContextDocument,
  listAgentContextDocuments,
  renameAgentContextDocument,
  replaceAgentContextDocumentFile,
  retryAgentContextDocument,
  uploadAgentContextDocuments,
} from '../services/agent-context-document.service';

export const agentContextDocumentController = new Hono()
  .basePath('/agent')
  .use(authMiddleware)
  /**
   * [GET] /agent/:agentId/documents
   * List an agent's documents.
   */
  .get('/:agentId/documents', validAgentIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const documents = await listAgentContextDocuments({ agentId: param.agentId, userId: user.id });

    return c.json({ documents });
  })
  /**
   * [POST] /agent/:agentId/documents
   * Upload one or more files in a single multipart request (`files` field).
   */
  .post('/:agentId/documents', validAgentIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const body = await c.req.parseBody({ all: true });
    const filesField = body.files;
    const files = Array.isArray(filesField) ? filesField : filesField ? [filesField] : [];
    const uploadedFiles = files.filter((file): file is File => file instanceof File);

    const documents = await uploadAgentContextDocuments({
      agentId: param.agentId,
      userId: user.id,
      files: uploadedFiles,
    });

    return c.json({ documents }, 201);
  })
  /**
   * [PUT] /agent/:agentId/documents/:documentId/file
   * Replace a document's file (`file` field).
   */
  .put('/:agentId/documents/:documentId/file', validAgentContextDocumentParams, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      throw new BadRequestException('A file is required');
    }

    const document = await replaceAgentContextDocumentFile({
      agentId: param.agentId,
      userId: user.id,
      documentId: param.documentId,
      file,
    });

    return c.json({ document });
  })
  /**
   * [PATCH] /agent/:agentId/documents/:documentId
   * Rename a document.
   */
  .patch(
    '/:agentId/documents/:documentId',
    validAgentContextDocumentParams,
    validRenameAgentContextDocumentBody,
    async (c) => {
      const user = c.get('user');
      const param = c.req.valid('param');
      const { name } = c.req.valid('json');

      const document = await renameAgentContextDocument({
        agentId: param.agentId,
        userId: user.id,
        documentId: param.documentId,
        name,
      });

      return c.json({ document });
    },
  )
  /**
   * [POST] /agent/:agentId/documents/:documentId/retry
   * Re-enqueue extraction for a failed document.
   */
  .post('/:agentId/documents/:documentId/retry', validAgentContextDocumentParams, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const document = await retryAgentContextDocument({
      agentId: param.agentId,
      userId: user.id,
      documentId: param.documentId,
    });

    return c.json({ document });
  })
  /**
   * [DELETE] /agent/:agentId/documents/:documentId
   * Remove a document and its R2 object (best effort).
   */
  .delete('/:agentId/documents/:documentId', validAgentContextDocumentParams, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    await deleteAgentContextDocument({
      agentId: param.agentId,
      userId: user.id,
      documentId: param.documentId,
    });

    return c.json({ message: 'Document deleted successfully' });
  });
