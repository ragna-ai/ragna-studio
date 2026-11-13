import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import { singleUploadBodyLimit } from '../middlewares/bodyLimit';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import { uploadAgentImage } from '../services/agent-image.service';
import { BadRequestException } from '../exceptions';
import {
  createAgentForWorkspace,
  createAgentFromTemplateForWorkspace,
  deleteAgentForWorkspace,
  getAgentForWorkspace,
  getAgentMemoryForWorkspace,
  listAgentsForWorkspace,
  replaceAgentMemoryForWorkspace,
  updateAgentForWorkspace,
} from '../services/agent.service';
import {
  validAgentFromTemplateBody,
  validAgentIdParam,
  validAgentMemoryBody,
  validCreateAgentBody,
  validPaginationQuery,
  validUpdateAgentBody,
} from '../validation';

export const agentController = new Hono()
  .basePath('/workspace/:workspaceId/agent')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/agent
   * List a workspace's agents, paginated.
   */
  .get('/', validPaginationQuery, async (c) => {
    const workspace = c.get('workspace');
    const query = c.req.valid('query');

    const { agents, totalCount } = await listAgentsForWorkspace({
      workspaceId: workspace.id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });

    return c.json({ agents, meta: { totalCount } });
  })
  /**
   * [POST] /workspace/:workspaceId/agent
   * Create an agent in this workspace.
   */
  .post('/', validCreateAgentBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const agent = await createAgentForWorkspace({
      workspaceId: workspace.id,
      userId: user.id,
      name: body.name,
      description: body.description,
      aiModelId: body.aiModelId,
      systemPrompt: body.systemPrompt,
      context: body.context,
      toolGrants: body.toolGrants,
      defaultDatasetId: body.defaultDatasetId,
      icon: body.icon,
      tone: body.tone,
      imageMediaId: body.imageMediaId,
      settings: body.settings,
    });

    return c.json({ agent }, StatusCodes.CREATED);
  })
  /**
   * [POST] /workspace/:workspaceId/agent/from-template
   * Create an agent in this workspace from an agent template.
   */
  .post('/from-template', validAgentFromTemplateBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const agent = await createAgentFromTemplateForWorkspace({
      workspaceId: workspace.id,
      userId: user.id,
      templateId: body.templateId,
    });

    return c.json({ agent }, StatusCodes.CREATED);
  })
  /**
   * [POST] /workspace/:workspaceId/agent/image-upload
   * Uploads an image to use as an agent's mark. Multipart upload: a `file` field.
   * PNG/JPEG only, 2 MB cap. Saved onto the agent via PATCH `imageMediaId`.
   */
  .post('/image-upload', singleUploadBodyLimit, async (c) => {
    const workspace = c.get('workspace');

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      throw new BadRequestException('A file is required');
    }

    const uploaded = await uploadAgentImage({ workspaceId: workspace.id, file });

    return c.json(uploaded, StatusCodes.CREATED);
  })
  /**
   * [GET] /workspace/:workspaceId/agent/:agentId
   */
  .get('/:agentId', validAgentIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const agent = await getAgentForWorkspace({
      workspaceId: workspace.id,
      agentId: param.agentId,
    });

    return c.json({ agent });
  })
  /**
   * [PATCH] /workspace/:workspaceId/agent/:agentId
   * Partial update. Never moves the agent to another workspace.
   */
  .patch('/:agentId', validAgentIdParam, validUpdateAgentBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const agent = await updateAgentForWorkspace({
      userId: user.id,
      workspaceId: workspace.id,
      agentId: param.agentId,
      name: body.name,
      description: body.description,
      aiModelId: body.aiModelId,
      systemPrompt: body.systemPrompt,
      context: body.context,
      toolGrants: body.toolGrants,
      defaultDatasetId: body.defaultDatasetId,
      icon: body.icon,
      tone: body.tone,
      imageMediaId: body.imageMediaId,
      settings: body.settings,
    });

    return c.json({ agent });
  })
  /**
   * [DELETE] /workspace/:workspaceId/agent/:agentId
   * Its documents cascade at the DB level, but their R2 objects don't, so
   * those are cleaned up first (best effort) before the row disappears.
   */
  .delete('/:agentId', validAgentIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteAgentForWorkspace({ workspaceId: workspace.id, agentId: param.agentId });

    return c.json({ message: 'Agent deleted successfully' });
  })
  /**
   * [GET] /workspace/:workspaceId/agent/:agentId/memory
   */
  .get('/:agentId/memory', validAgentIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const content = await getAgentMemoryForWorkspace({
      workspaceId: workspace.id,
      agentId: param.agentId,
    });

    return c.json({ memory: { content } });
  })
  /**
   * [PUT] /workspace/:workspaceId/agent/:agentId/memory
   * Replaces the memory document for this agent.
   */
  .put('/:agentId/memory', validAgentIdParam, validAgentMemoryBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const content = await replaceAgentMemoryForWorkspace({
      workspaceId: workspace.id,
      agentId: param.agentId,
      content: body.content,
    });

    return c.json({ memory: { content } });
  });
