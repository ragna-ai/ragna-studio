import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  createTaskLabelForWorkspace,
  deleteTaskLabelForWorkspace,
  listTaskLabelsForWorkspace,
  updateTaskLabelForWorkspace,
} from '../services/task-label.service';
import { validCreateTaskLabelBody, validTaskLabelIdParam, validUpdateTaskLabelBody } from '../validation';

export const taskLabelController = new Hono()
  .basePath('/workspace/:workspaceId/task-label')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/task-label
   * Lists every label in the workspace. Not paginated: a workspace's label
   * set is small and naturally bounded (docs/api-standards/prd.md,
   * "Pagination").
   */
  .get('/', async (c) => {
    const workspace = c.get('workspace');

    const taskLabels = await listTaskLabelsForWorkspace({ workspaceId: workspace.id });

    return c.json({ taskLabels });
  })
  /**
   * [POST] /workspace/:workspaceId/task-label
   */
  .post('/', validCreateTaskLabelBody, async (c) => {
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const taskLabel = await createTaskLabelForWorkspace({
      workspaceId: workspace.id,
      name: body.name,
      color: body.color,
    });

    return c.json({ taskLabel }, StatusCodes.CREATED);
  })
  /**
   * [PATCH] /workspace/:workspaceId/task-label/:taskLabelId
   * Partial update of name/color.
   */
  .patch('/:taskLabelId', validTaskLabelIdParam, validUpdateTaskLabelBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const taskLabel = await updateTaskLabelForWorkspace({
      workspaceId: workspace.id,
      taskLabelId: param.taskLabelId,
      name: body.name,
      color: body.color,
    });

    return c.json({ taskLabel });
  })
  /**
   * [DELETE] /workspace/:workspaceId/task-label/:taskLabelId
   * Cascades the join rows only, never touches tasks.
   */
  .delete('/:taskLabelId', validTaskLabelIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteTaskLabelForWorkspace({ workspaceId: workspace.id, taskLabelId: param.taskLabelId });

    return c.json({ message: 'Task label deleted successfully' });
  });
