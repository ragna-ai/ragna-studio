import type { Task, TaskPriority, TaskStatus, TaskWithBoardInfo, TaskWithDetails } from '@repo/database';
import { createTask, deleteTask, getTaskById, listTasks, moveTask, updateTask } from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';

// Every function below runs after the workspace guard has verified the
// caller owns `:workspaceId`; access is scoped
// by workspaceId, never userId.

/**
 * Loads one task and converts a missing row into a 404. Shared by the GET
 * handler and every business rule below that needs to inspect the current
 * task (reminder/parent checks), so a bad id 404s consistently everywhere.
 */
async function getTaskOrThrow({
  workspaceId,
  taskId,
  notFoundMessage = 'Task not found',
}: {
  workspaceId: string;
  taskId: string;
  notFoundMessage?: string;
}): Promise<TaskWithDetails> {
  const { error, data: taskRecord } = await tryCatch(() => getTaskById({ id: taskId, workspaceId }));

  if (error !== null) {
    logger.error('Failed to load task', error);
    throw new InternalServerErrorException('Failed to load task');
  }

  if (!taskRecord) {
    throw new NotFoundException(notFoundMessage);
  }

  return taskRecord;
}

// One-level subtask rule: a task that already
// has a parent cannot itself become a parent. Shared by create and PATCH.
async function assertParentIsTopLevel({
  workspaceId,
  parentTaskId,
}: {
  workspaceId: string;
  parentTaskId: string;
}): Promise<void> {
  const parentTask = await getTaskOrThrow({
    workspaceId,
    taskId: parentTaskId,
    notFoundMessage: 'Parent task not found',
  });

  if (parentTask.parentTaskId !== null) {
    throw new BadRequestException('A subtask cannot itself be a parent (subtasks are one level deep)');
  }
}

/**
 * [GET] /workspace/:workspaceId/task
 * Not paginated: a board needs every card.
 */
export async function listTasksForWorkspace({
  workspaceId,
  status,
  priority,
  taskLabelId,
}: {
  workspaceId: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  taskLabelId?: string;
}): Promise<TaskWithBoardInfo[]> {
  const { error, data: tasks } = await tryCatch(() =>
    listTasks({ workspaceId, status, priority, taskLabelId }),
  );

  if (error !== null || !tasks) {
    logger.error('Failed to list tasks', error);
    throw new InternalServerErrorException('Failed to list tasks');
  }

  return tasks;
}

/**
 * [GET] /workspace/:workspaceId/task/:taskId
 */
export async function getTask({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}): Promise<TaskWithDetails> {
  return getTaskOrThrow({ workspaceId, taskId });
}

/**
 * [POST] /workspace/:workspaceId/task
 * Human-created: sets createdByUserId. Server assigns `number` and appends
 * to the bottom of the target column (handled inside the repo).
 */
export async function createTaskForUser({
  workspaceId,
  userId,
  title,
  description,
  status,
  priority,
  dueDate,
  remindDaysBeforeDue,
  parentTaskId,
  assignedAgentId,
  labelIds,
}: {
  workspaceId: string;
  userId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  remindDaysBeforeDue?: number | null;
  parentTaskId?: string | null;
  assignedAgentId?: string | null;
  labelIds?: string[];
}): Promise<Task> {
  const setsReminder = remindDaysBeforeDue !== undefined && remindDaysBeforeDue !== null;
  if (setsReminder && !dueDate) {
    throw new BadRequestException('remindDaysBeforeDue requires a due date');
  }

  if (parentTaskId) {
    await assertParentIsTopLevel({ workspaceId, parentTaskId });
  }

  const { error, data: createdTask } = await tryCatch(() =>
    createTask({
      workspaceId,
      title,
      description,
      status,
      priority,
      dueDate,
      remindDaysBeforeDue,
      parentTaskId,
      assignedAgentId,
      createdByUserId: userId,
      labelIds,
    }),
  );

  if (error !== null || !createdTask) {
    logger.error('Failed to create task', error);
    throw new InternalServerErrorException('Failed to create task');
  }

  return createdTask;
}

type UpdateTaskFields = {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: Date | null;
  remindDaysBeforeDue?: number | null;
  parentTaskId?: string | null;
  assignedAgentId?: string | null;
};

// Reminder rule: remindDaysBeforeDue can only be
// (re)armed if the task ends up with a due date. If this request doesn't
// touch dueDate, the existing task must already have one.
async function assertReminderHasDueDate({
  workspaceId,
  taskId,
  fields,
}: {
  workspaceId: string;
  taskId: string;
  fields: UpdateTaskFields;
}): Promise<void> {
  const setsReminder = 'remindDaysBeforeDue' in fields && fields.remindDaysBeforeDue !== null;
  const dueDateProvided = 'dueDate' in fields;
  if (!setsReminder || dueDateProvided) {
    return;
  }

  const existingTask = await getTaskOrThrow({ workspaceId, taskId });
  if (!existingTask.dueDate) {
    throw new BadRequestException('remindDaysBeforeDue requires a due date');
  }
}

// Parent rule: a task with subtasks cannot
// become a subtask itself, on top of the same one-level check create uses.
async function assertParentTaskChangeIsValid({
  workspaceId,
  taskId,
  fields,
}: {
  workspaceId: string;
  taskId: string;
  fields: UpdateTaskFields;
}): Promise<void> {
  if (!('parentTaskId' in fields) || !fields.parentTaskId) {
    return;
  }

  const existingTask = await getTaskOrThrow({ workspaceId, taskId });
  if (existingTask.subtasks.length > 0) {
    throw new BadRequestException('A task with subtasks cannot become a subtask');
  }

  await assertParentIsTopLevel({ workspaceId, parentTaskId: fields.parentTaskId });
}

/**
 * [PATCH] /workspace/:workspaceId/task/:taskId
 * Partial update. Only forwards the keys the caller actually sent: the repo
 * tells "sent null" apart from "not sent" via key presence, which is how
 * clearing dueDate/parentTaskId and the reminder re-arm logic work.
 */
export async function updateTaskForUser({
  workspaceId,
  taskId,
  labelIds,
  ...fields
}: {
  workspaceId: string;
  taskId: string;
  labelIds?: string[];
} & UpdateTaskFields): Promise<Task> {
  await assertReminderHasDueDate({ workspaceId, taskId, fields });
  await assertParentTaskChangeIsValid({ workspaceId, taskId, fields });

  const { error, data: updatedTask } = await tryCatch(() =>
    updateTask({ id: taskId, workspaceId, labelIds, ...fields }),
  );

  if (error !== null) {
    logger.error('Failed to update task', error);
    throw new InternalServerErrorException('Failed to update task');
  }

  if (!updatedTask) {
    throw new NotFoundException('Task not found');
  }

  return updatedTask;
}

// The repo throws a plain Error (no typed error class) when `afterTaskId`
// isn't in the target workspace/status column; matched by message since
// that's the only signal it gives us.
function isInvalidAfterTaskIdError(error: Error): boolean {
  return error.message.includes('afterTaskId does not belong to the target');
}

/**
 * [POST] /workspace/:workspaceId/task/:taskId/move
 * Server computes the new sortOrder from the target column's neighbors.
 */
export async function moveTaskForUser({
  workspaceId,
  taskId,
  status,
  afterTaskId,
}: {
  workspaceId: string;
  taskId: string;
  status: TaskStatus;
  afterTaskId?: string | null;
}): Promise<Task> {
  const { error, data: movedTask } = await tryCatch(() =>
    moveTask({ id: taskId, workspaceId, status, afterTaskId }),
  );

  if (error !== null) {
    if (isInvalidAfterTaskIdError(error)) {
      throw new BadRequestException('afterTaskId does not belong to the target status column');
    }

    logger.error('Failed to move task', error);
    throw new InternalServerErrorException('Failed to move task');
  }

  if (!movedTask) {
    throw new NotFoundException('Task not found');
  }

  return movedTask;
}

/**
 * [DELETE] /workspace/:workspaceId/task/:taskId
 * Subtasks survive as top-level tasks (FK set-null), nothing else to do here.
 */
export async function deleteTaskForUser({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}): Promise<void> {
  await deleteTask({ id: taskId, workspaceId });
}
