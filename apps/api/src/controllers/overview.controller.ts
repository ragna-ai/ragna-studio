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
   * The home page's overview cards in one round trip: the latest 5 tasks,
   * chats, workflows, agents, and documents, each with its workspace
   * total, plus the calendar's tasks due in a fixed window around today.
   */
  .get('/', async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');

    const overview = await getWorkspaceOverview({ workspaceId: workspace.id, userId: user.id });

    return c.json(overview);
  });
