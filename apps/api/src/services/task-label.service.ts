import type { TaskLabel } from '@repo/database';
import {
  createTaskLabel,
  deleteTaskLabel,
  isUniqueViolationError,
  listTaskLabels,
  updateTaskLabel,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';

// Every function below runs after the workspace guard has verified the
// caller owns `:workspaceId`.

/**
 * [GET] /workspace/:workspaceId/task-label
 */
export async function listTaskLabelsForWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<TaskLabel[]> {
  const { error, data: taskLabels } = await tryCatch(() => listTaskLabels({ workspaceId }));

  if (error !== null || !taskLabels) {
    logger.error('Failed to list task labels', error);
    throw new InternalServerErrorException('Failed to list task labels');
  }

  return taskLabels;
}

/**
 * [POST] /workspace/:workspaceId/task-label
 */
export async function createTaskLabelForWorkspace({
  workspaceId,
  name,
  color,
}: {
  workspaceId: string;
  name: string;
  color: string;
}): Promise<TaskLabel> {
  const { error, data: createdTaskLabel } = await tryCatch(() =>
    createTaskLabel({ workspaceId, name, color }),
  );

  if (error !== null) {
    if (isUniqueViolationError(error)) {
      throw new BadRequestException(`A label named "${name}" already exists in this workspace`);
    }

    logger.error('Failed to create task label', error);
    throw new InternalServerErrorException('Failed to create task label');
  }

  if (!createdTaskLabel) {
    throw new InternalServerErrorException('Failed to create task label');
  }

  return createdTaskLabel;
}

/**
 * [PATCH] /workspace/:workspaceId/task-label/:taskLabelId
 * Partial update of name/color.
 */
export async function updateTaskLabelForWorkspace({
  workspaceId,
  taskLabelId,
  name,
  color,
}: {
  workspaceId: string;
  taskLabelId: string;
  name?: string;
  color?: string;
}): Promise<TaskLabel> {
  const { error, data: updatedTaskLabel } = await tryCatch(() =>
    updateTaskLabel({ id: taskLabelId, workspaceId, name, color }),
  );

  if (error !== null) {
    if (name !== undefined && isUniqueViolationError(error)) {
      throw new BadRequestException(`A label named "${name}" already exists in this workspace`);
    }

    logger.error('Failed to update task label', error);
    throw new InternalServerErrorException('Failed to update task label');
  }

  if (!updatedTaskLabel) {
    throw new NotFoundException('Task label not found');
  }

  return updatedTaskLabel;
}

/**
 * [DELETE] /workspace/:workspaceId/task-label/:taskLabelId
 * Cascades the join rows only, never touches tasks.
 */
export async function deleteTaskLabelForWorkspace({
  workspaceId,
  taskLabelId,
}: {
  workspaceId: string;
  taskLabelId: string;
}): Promise<void> {
  await deleteTaskLabel({ id: taskLabelId, workspaceId });
}
