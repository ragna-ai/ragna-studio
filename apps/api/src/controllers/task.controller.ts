import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  createTaskForUser,
  deleteTaskForUser,
  getTask,
  listTasksForWorkspace,
  moveTaskForUser,
  updateTaskForUser,
} from '../services/task.service';
import {
  validCreateTaskBody,
  validMoveTaskBody,
  validTaskIdParam,
  validTaskListQuery,
  validUpdateTaskBody,
} from '../validation';

export const taskController = new Hono()
  .basePath('/workspace/:workspaceId/task')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/task
   * Lists every task in the workspace, ordered by sortOrder, with labels,
   * assigned agent, and subtask counts. Not paginated: a board needs every
   * card (docs/tasks/prd.md, "List"). Optional filters: status, priority,
   * taskLabelId.
   */
  .get('/', validTaskListQuery, async (c) => {
    const workspace = c.get('workspace');
    const query = c.req.valid('query');

    const tasks = await listTasksForWorkspace({
      workspaceId: workspace.id,
      status: query.status,
      priority: query.priority,
      taskLabelId: query.taskLabelId,
    });

    return c.json({ tasks });
  })
  /**
   * [POST] /workspace/:workspaceId/task
   * Human-created: sets createdByUserId. Server assigns the TSK-<number>
   * and appends the task to the bottom of the target column.
   */
  .post('/', validCreateTaskBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const taskRecord = await createTaskForUser({
      workspaceId: workspace.id,
      userId: user.id,
      title: body.title,
      description: body.description,
      status: body.status,
      priority: body.priority,
      dueDate: body.dueDate,
      remindDaysBeforeDue: body.remindDaysBeforeDue,
      parentTaskId: body.parentTaskId,
      assignedAgentId: body.assignedAgentId,
      labelIds: body.labelIds,
    });

    return c.json({ task: taskRecord }, 201);
  })
  /**
   * [GET] /workspace/:workspaceId/task/:taskId
   */
  .get('/:taskId', validTaskIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const taskRecord = await getTask({ workspaceId: workspace.id, taskId: param.taskId });

    return c.json({ task: taskRecord });
  })
  /**
   * [PATCH] /workspace/:workspaceId/task/:taskId
   * Partial update of title/description/priority/dueDate/
   * remindDaysBeforeDue/parentTaskId/assignedAgentId/labelIds. Not
   * status/sortOrder: moving a task is the dedicated /move action below.
   */
  .patch('/:taskId', validTaskIdParam, validUpdateTaskBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const taskRecord = await updateTaskForUser({
      workspaceId: workspace.id,
      taskId: param.taskId,
      ...body,
    });

    return c.json({ task: taskRecord });
  })
  /**
   * [DELETE] /workspace/:workspaceId/task/:taskId
   * Subtasks survive as top-level tasks.
   */
  .delete('/:taskId', validTaskIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteTaskForUser({ workspaceId: workspace.id, taskId: param.taskId });

    return c.json({ message: 'Task deleted successfully' });
  })
  /**
   * [POST] /workspace/:workspaceId/task/:taskId/move
   * One atomic call per drag: server computes the new sortOrder from the
   * target column's neighbors. Omitted afterTaskId means top of the column.
   */
  .post('/:taskId/move', validTaskIdParam, validMoveTaskBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const taskRecord = await moveTaskForUser({
      workspaceId: workspace.id,
      taskId: param.taskId,
      status: body.status,
      afterTaskId: body.afterTaskId,
    });

    return c.json({ task: taskRecord });
  });
