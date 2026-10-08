import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

const taskStatus = z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']);
const taskPriority = z.enum(['none', 'urgent', 'high', 'medium', 'low']);

export const validTaskIdParam = myzValidator(
  'param',
  z.object({
    taskId: primaryId,
  }),
);

export const validTaskAttachmentParams = myzValidator(
  'param',
  z.object({
    taskId: primaryId,
    attachmentId: primaryId,
  }),
);

// List is unpaginated: a board needs every card.
// Only optional filters, no page/limit/sort.
export const validTaskListQuery = myzValidator(
  'query',
  z.object({
    status: taskStatus.optional(),
    priority: taskPriority.optional(),
    taskLabelId: primaryId.optional(),
  }),
);

// workspaceId comes from the path (validated by the workspace guard), never
// the body. status/sortOrder are not accepted here: create always lands at
// the bottom of the target column, server-computed.
export const validCreateTaskBody = myzValidator(
  'json',
  z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(1_000_000).optional(),
    status: taskStatus.optional(),
    priority: taskPriority.optional(),
    dueDate: z.coerce.date().nullish(),
    remindDaysBeforeDue: z.number().int().min(0).nullish(),
    parentTaskId: primaryId.nullish(),
    assignedAgentId: primaryId.nullish(),
    labelIds: z.array(primaryId).optional(),
  }),
);

// PATCH: every field optional, only the ones sent are updated. status and
// sortOrder are intentionally absent: moving a task is the dedicated
// POST /task/:taskId/move action.
export const validUpdateTaskBody = myzValidator(
  'json',
  z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(1_000_000).optional(),
    priority: taskPriority.optional(),
    dueDate: z.coerce.date().nullish(),
    remindDaysBeforeDue: z.number().int().min(0).nullish(),
    parentTaskId: primaryId.nullish(),
    assignedAgentId: primaryId.nullish(),
    labelIds: z.array(primaryId).optional(),
  }),
);

export const validMoveTaskBody = myzValidator(
  'json',
  z.object({
    status: taskStatus,
    // Omitted = top of the column.
    afterTaskId: primaryId.nullish(),
  }),
);
