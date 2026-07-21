import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import { getWorkspaceOverview } from '../services/overview.service';

export const overviewController = new Hono()
  .basePath('/workspace/:workspaceId/overview')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/overview
   * The home page's four overview cards in one round trip: the latest 5
   * tasks, chats, workflows, and agents, each with its workspace total
   * (docs/home/prd.md).
   */
  .get('/', async (c) => {
    const workspace = c.get('workspace');

    const overview = await getWorkspaceOverview(workspace.id);

    return c.json(overview);
  });
