import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import { multiUploadBodyLimit } from '../middlewares/bodyLimit';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  listTaskAttachments,
  removeTaskAttachment,
  uploadTaskAttachments,
} from '../services/task-attachment.service';
import {
  createTaskCommentForUser,
  editTaskComment,
  listTaskComments,
  removeTaskComment,
} from '../services/task-comment.service';
import { cancelTaskRun, listTaskRuns, startTaskRunForUser } from '../services/task-run.service';
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
  validStartTaskRunBody,
  validMoveTaskBody,
  validTaskAttachmentParams,
  validTaskCommentBody,
  validTaskCommentParams,
  validTaskIdParam,
  validTaskListQuery,
  validTaskRunParams,
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
   * card. Optional filters: status, priority,
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

    return c.json({ task: taskRecord }, StatusCodes.CREATED);
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
  })
  /**
   * [GET] /workspace/:workspaceId/task/:taskId/attachments
   */
  .get('/:taskId/attachments', validTaskIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const result = await listTaskAttachments({
      workspaceId: workspace.id,
      taskId: param.taskId,
    });

    return c.json(result);
  })
  /**
   * [POST] /workspace/:workspaceId/task/:taskId/attachments
   * Upload one or more files in a single multipart request (`files` field)
   * and attach them to the task.
   */
  .post('/:taskId/attachments', multiUploadBodyLimit, validTaskIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const body = await c.req.parseBody({ all: true });
    const filesField = body.files;
    const files = Array.isArray(filesField) ? filesField : filesField ? [filesField] : [];
    const uploadedFiles = files.filter((file): file is File => file instanceof File);

    const result = await uploadTaskAttachments({
      workspaceId: workspace.id,
      taskId: param.taskId,
      files: uploadedFiles,
    });

    return c.json(result, StatusCodes.CREATED);
  })
  /**
   * [DELETE] /workspace/:workspaceId/task/:taskId/attachments/:attachmentId
   * Detaches a file from the task and deletes its media once unreferenced.
   */
  .delete('/:taskId/attachments/:attachmentId', validTaskAttachmentParams, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await removeTaskAttachment({
      workspaceId: workspace.id,
      taskId: param.taskId,
      attachmentId: param.attachmentId,
    });

    return c.json({ message: 'Attachment deleted successfully' });
  })
  /**
   * [GET] /workspace/:workspaceId/task/:taskId/runs
   * Every agent run of the task, newest first.
   */
  .get('/:taskId/runs', validTaskIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const runs = await listTaskRuns({ workspaceId: workspace.id, taskId: param.taskId });

    return c.json({ runs });
  })
  /**
   * [POST] /workspace/:workspaceId/task/:taskId/runs
   * Starts an agent run. An `agentId` in the body assigns that agent first. Answers 409
   * task-has-no-agent, agent-not-approved or task-run-active, 402 out-of-credits, 429
   * task-run-limit-reached and 503 task-runs-disabled.
   */
  .post('/:taskId/runs', validTaskIdParam, validStartTaskRunBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const run = await startTaskRunForUser({
      workspaceId: workspace.id,
      taskId: param.taskId,
      userId: user.id,
      agentId: body.agentId,
    });

    return c.json({ run }, StatusCodes.CREATED);
  })
  /**
   * [POST] /workspace/:workspaceId/task/:taskId/runs/:taskRunId/cancel
   * 409 when the run has already finished.
   */
  .post('/:taskId/runs/:taskRunId/cancel', validTaskRunParams, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const run = await cancelTaskRun({
      workspaceId: workspace.id,
      taskId: param.taskId,
      taskRunId: param.taskRunId,
    });

    return c.json({ run });
  })
  /**
   * [GET] /workspace/:workspaceId/task/:taskId/comments
   * Every comment of the task, oldest first. Not paginated: a task holds at most 100.
   */
  .get('/:taskId/comments', validTaskIdParam, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const comments = await listTaskComments({
      workspaceId: workspace.id,
      taskId: param.taskId,
      viewer: { userId: user.id, workspaceRole: c.get('workspaceRole') },
    });

    return c.json({ comments });
  })
  /**
   * [POST] /workspace/:workspaceId/task/:taskId/comments
   * 409 task-comment-limit-reached once the task holds 100 comments.
   */
  .post('/:taskId/comments', validTaskIdParam, validTaskCommentBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const comment = await createTaskCommentForUser({
      workspaceId: workspace.id,
      taskId: param.taskId,
      viewer: { userId: user.id, workspaceRole: c.get('workspaceRole') },
      body: body.body,
    });

    return c.json({ comment }, StatusCodes.CREATED);
  })
  /**
   * [PATCH] /workspace/:workspaceId/task/:taskId/comments/:commentId
   * Own user comments only. Agent comments answer 409 task-comment-not-editable.
   */
  .patch(
    '/:taskId/comments/:commentId',
    validTaskCommentParams,
    validTaskCommentBody,
    async (c) => {
      const user = c.get('user');
      const workspace = c.get('workspace');
      const param = c.req.valid('param');
      const body = c.req.valid('json');

      const comment = await editTaskComment({
        workspaceId: workspace.id,
        taskId: param.taskId,
        commentId: param.commentId,
        viewer: { userId: user.id, workspaceRole: c.get('workspaceRole') },
        body: body.body,
      });

      return c.json({ comment });
    },
  )
  /**
   * [DELETE] /workspace/:workspaceId/task/:taskId/comments/:commentId
   * Own comment, or any comment as workspace manager.
   */
  .delete('/:taskId/comments/:commentId', validTaskCommentParams, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await removeTaskComment({
      workspaceId: workspace.id,
      taskId: param.taskId,
      commentId: param.commentId,
      viewer: { userId: user.id, workspaceRole: c.get('workspaceRole') },
    });

    return c.json({ message: 'Comment deleted successfully' });
  });
