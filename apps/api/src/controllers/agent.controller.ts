import {
  deleteAgentById,
  getAgentById,
  getAgentCountByUserId,
  getAllAgentsByUserId,
  getMemoryByAgentId,
  upsertAgent,
  upsertMemory,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import { InternalServerErrorException, NotFoundException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validAgentIdParam,
  validAgentMemoryBody,
  validUpsertAgentBody,
  validWorkspaceScopedListQuery,
} from '../middlewares/validationMiddlewares';

export const agentController = new Hono()
  .basePath('/agent')
  .use(authMiddleware)
  /**
   * [GET] /agent
   * Get all agents for the authenticated user
   */
  .get('/', validWorkspaceScopedListQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const sort = query.sort || 'desc';
    const unassigned = query.unassigned === 'true';

    // Calculate offset for pagination ((page number - 1) * page size)
    const offset = page && limit ? (page - 1) * limit : undefined;

    // Get all agent count and fail gracefully
    const { data: agentsCount } = await tryCatch(() =>
      getAgentCountByUserId({ userId: user.id, workspaceId: query.workspaceId, unassigned }),
    );

    const { error, data: allUserAgents } = await tryCatch(() =>
      getAllAgentsByUserId({
        userId: user.id,
        workspaceId: query.workspaceId,
        unassigned,
        limit,
        sort,
        offset,
      }),
    );

    if (error !== null) {
      logger.error('Failed to get agents for user', error);
      throw new InternalServerErrorException('Failed to get agents for user');
    }

    const meta = {
      totalCount: agentsCount || 0,
    };

    return c.json({ agents: allUserAgents, meta });
  })
  /**
   * [POST] /agent
   * Create or update an agent
   */
  .post('/', validUpsertAgentBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const { error: upsertAgentError, data: upsertedAgent } = await tryCatch(() =>
      upsertAgent({
        id: body.id ?? undefined,
        userId: user.id,
        name: body.name,
        description: body.description,
        aiModelId: body.aiModelId,
        systemPrompt: body.systemPrompt,
        tools: body.tools,
        isDefault: body.isDefault,
        workspaceId: body.workspaceId,
      }),
    );

    if (upsertAgentError !== null) {
      logger.error('Failed to upsert agent', upsertAgentError);
      throw new InternalServerErrorException('Failed to upsert agent');
    }

    return c.json({ agent: upsertedAgent });
  })
  /**
   * [GET] /agent/:agentId
   * Get a specific agent by ID
   */
  .get('/:agentId', validAgentIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: agent } = await tryCatch(() =>
      getAgentById({ agentId: param.agentId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get agent by ID', error);
      throw new InternalServerErrorException('Failed to get agent by ID');
    }

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return c.json({ agent });
  })
  /**
   * [DELETE] /agent/:agentId
   * Delete a specific agent by ID
   */
  .delete('/:agentId', validAgentIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    await deleteAgentById({ agentId: param.agentId, userId: user.id });

    return c.json({ message: 'Agent deleted successfully' });
  })
  /**
   * [GET] /agent/:agentId/memory
   * Get the memory document for a specific agent
   */
  .get('/:agentId/memory', validAgentIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error: agentError, data: agent } = await tryCatch(() =>
      getAgentById({ agentId: param.agentId, userId: user.id }),
    );

    if (agentError !== null) {
      logger.error('Failed to get agent by ID', agentError);
      throw new InternalServerErrorException('Failed to get agent by ID');
    }

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const { error: memoryError, data: memory } = await tryCatch(() =>
      getMemoryByAgentId({ agentId: param.agentId }),
    );

    if (memoryError !== null) {
      logger.error('Failed to get agent memory', memoryError);
      throw new InternalServerErrorException('Failed to get agent memory');
    }

    return c.json({ memory: { content: memory?.content ?? '' } });
  })
  /**
   * [PUT] /agent/:agentId/memory
   * Replace the memory document for a specific agent
   */
  .put('/:agentId/memory', validAgentIdParam, validAgentMemoryBody, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const { error: agentError, data: agent } = await tryCatch(() =>
      getAgentById({ agentId: param.agentId, userId: user.id }),
    );

    if (agentError !== null) {
      logger.error('Failed to get agent by ID', agentError);
      throw new InternalServerErrorException('Failed to get agent by ID');
    }

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const { error: upsertMemoryError, data: memory } = await tryCatch(() =>
      upsertMemory({ agentId: param.agentId, content: body.content }),
    );

    if (upsertMemoryError !== null) {
      logger.error('Failed to update agent memory', upsertMemoryError);
      throw new InternalServerErrorException('Failed to update agent memory');
    }

    return c.json({ memory: { content: memory.content } });
  });
