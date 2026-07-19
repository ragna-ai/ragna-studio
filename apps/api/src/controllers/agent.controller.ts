import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  createAgentForWorkspace,
  deleteAgentForWorkspace,
  getAgentForWorkspace,
  getAgentMemoryForWorkspace,
  listAgentsForWorkspace,
  replaceAgentMemoryForWorkspace,
  updateAgentForWorkspace,
} from '../services/agent.service';
import {
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

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sort = query.sort ?? 'desc';

    const { agents, totalCount } = await listAgentsForWorkspace({
      workspaceId: workspace.id,
      page,
      limit,
      sort,
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
      tools: body.tools,
      isDefault: body.isDefault,
      defaultDatasetId: body.defaultDatasetId,
      settings: body.settings,
    });

    return c.json({ agent }, 201);
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
      workspaceId: workspace.id,
      agentId: param.agentId,
      userId: user.id,
      name: body.name,
      description: body.description,
      aiModelId: body.aiModelId,
      systemPrompt: body.systemPrompt,
      context: body.context,
      tools: body.tools,
      isDefault: body.isDefault,
      defaultDatasetId: body.defaultDatasetId,
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
