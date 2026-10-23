import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { listAgentTemplatesForUser } from '../services/agent.service';

export const agentTemplateController = new Hono()
  .basePath('/agent-template')
  .use(authMiddleware)
  /**
   * [GET] /agent-template
   * List every agent template with its model display name.
   */
  .get('/', async (c) => {
    const response = await listAgentTemplatesForUser();

    return c.json(response);
  });
