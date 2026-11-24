import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import { cancelAllTaskRuns } from '../services/task-run.service';

export const taskRunController = new Hono()
  .basePath('/workspace/:workspaceId/task-runs')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [POST] /workspace/:workspaceId/task-runs/cancel-all
   * Stops every active agent run of the workspace. Workspace managers only.
   */
  .post('/cancel-all', async (c) => {
    const workspace = c.get('workspace');

    const result = await cancelAllTaskRuns({
      workspaceId: workspace.id,
      workspaceRole: c.get('workspaceRole'),
    });

    return c.json(result);
  });
