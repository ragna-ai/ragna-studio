import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { BadRequestException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import { multiUploadBodyLimit, singleUploadBodyLimit } from '../middlewares/bodyLimit';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  deleteAgentContextDocument,
  listAgentContextDocuments,
  renameAgentContextDocument,
  replaceAgentContextDocumentFile,
  retryAgentContextDocument,
  uploadAgentContextDocuments,
} from '../services/agent-context-document.service';
import {
  validAgentContextDocumentParams,
  validAgentIdParam,
  validRenameAgentContextDocumentBody,
} from '../validation';

export const agentContextDocumentController = new Hono()
  .basePath('/workspace/:workspaceId/agent/:agentId/context-document')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/agent/:agentId/context-document
   * List an agent's documents.
   */
  .get('/', validAgentIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const result = await listAgentContextDocuments({
      agentId: param.agentId,
      workspaceId: workspace.id,
    });

    return c.json(result);
  })
  /**
   * [POST] /workspace/:workspaceId/agent/:agentId/context-document
   * Upload one or more files in a single multipart request (`files` field).
   */
  .post('/', multiUploadBodyLimit, validAgentIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const body = await c.req.parseBody({ all: true });
    const filesField = body.files;
    const files = Array.isArray(filesField) ? filesField : filesField ? [filesField] : [];
    const uploadedFiles = files.filter((file): file is File => file instanceof File);

    const documents = await uploadAgentContextDocuments({
      agentId: param.agentId,
      workspaceId: workspace.id,
      files: uploadedFiles,
    });

    return c.json({ documents }, StatusCodes.CREATED);
  })
  /**
   * [PUT] /workspace/:workspaceId/agent/:agentId/context-document/:documentId/file
   * Replace a document's file (`file` field).
   */
  .put('/:documentId/file', singleUploadBodyLimit, validAgentContextDocumentParams, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      throw new BadRequestException('A file is required');
    }

    const document = await replaceAgentContextDocumentFile({
      agentId: param.agentId,
      workspaceId: workspace.id,
      documentId: param.documentId,
      file,
    });

    return c.json({ document });
  })
  /**
   * [PATCH] /workspace/:workspaceId/agent/:agentId/context-document/:documentId
   * Rename a document.
   */
  .patch(
    '/:documentId',
    validAgentContextDocumentParams,
    validRenameAgentContextDocumentBody,
    async (c) => {
      const workspace = c.get('workspace');
      const param = c.req.valid('param');
      const body = c.req.valid('json');

      const document = await renameAgentContextDocument({
        agentId: param.agentId,
        workspaceId: workspace.id,
        documentId: param.documentId,
        name: body.name,
      });

      return c.json({ document });
    },
  )
  /**
   * [POST] /workspace/:workspaceId/agent/:agentId/context-document/:documentId/retry
   * Re-enqueue extraction for a failed document.
   */
  .post('/:documentId/retry', validAgentContextDocumentParams, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const document = await retryAgentContextDocument({
      agentId: param.agentId,
      workspaceId: workspace.id,
      documentId: param.documentId,
    });

    return c.json({ document });
  })
  /**
   * [DELETE] /workspace/:workspaceId/agent/:agentId/context-document/:documentId
   * Remove a document and its R2 object (best effort).
   */
  .delete('/:documentId', validAgentContextDocumentParams, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteAgentContextDocument({
      agentId: param.agentId,
      workspaceId: workspace.id,
      documentId: param.documentId,
    });

    return c.json({ message: 'Document deleted successfully' });
  });
