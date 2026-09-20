import type {
  Task,
  TaskPriority,
  TaskStatus,
  TaskWithBoardInfo,
  TaskWithDetails,
} from '@repo/database';
import { createTask, getTaskById, listTasks, listTaskLabels, moveTask, updateTask } from '@repo/database';
import { tryCatch } from '@repo/utils';
import type {
  InferToolInput,
  InferToolOutput,
  InferUITool,
  Tool,
  UIMessage,
  UIMessageStreamWriter,
} from 'ai';
import { tool } from 'ai';
import * as z from 'zod';
import { optionalNonEmptyString } from './zod-helpers';

// Workspace-scoped: a task always belongs to a workspace (the workspace is
// the board, docs/tasks/prd.md), and every chat (and therefore every tool
// call) always has one. Tasks created via these tools inherit the chat's
// workspace and are marked as agent-created.
//
// Every schema below is a flat top-level z.object: Anthropic's tool
// `input_schema` requires a top-level `type: "object"`, and a top-level
// union (e.g. z.discriminatedUnion) compiles to `anyOf` with no `type`,
// which the API rejects. Nullable fields (e.g. `dueDate`) are fine, they
// stay inside a flat object and let the model explicitly clear a value
// versus omitting it, mirroring the repo's key-presence update semantics.
//
// No delete tool: the Canceled status covers abandonment (docs/tasks/prd.md,
// "Agent tools").

const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] as const satisfies readonly TaskStatus[];
const TASK_PRIORITIES = ['none', 'urgent', 'high', 'medium', 'low'] as const satisfies readonly TaskPriority[];

function toTaskDisplayId(taskNumber: number): string {
  return `TSK-${taskNumber}`;
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function toTaskSummary(taskRecord: TaskWithBoardInfo) {
  return {
    id: taskRecord.id,
    displayId: toTaskDisplayId(taskRecord.number),
    title: taskRecord.title,
    status: taskRecord.status,
    priority: taskRecord.priority,
    dueDate: taskRecord.dueDate?.toISOString() ?? null,
    remindDaysBeforeDue: taskRecord.remindDaysBeforeDue,
    labels: taskRecord.labels.map((label) => label.name),
    parentTaskId: taskRecord.parentTaskId,
    assignedAgent: taskRecord.assignedAgent?.name ?? null,
    subtaskCount: taskRecord.subtaskCount,
  };
}

function toSubtaskSummary(subtask: Task) {
  return {
    id: subtask.id,
    displayId: toTaskDisplayId(subtask.number),
    title: subtask.title,
    status: subtask.status,
  };
}

function toTaskDetail(taskRecord: TaskWithDetails) {
  return {
    id: taskRecord.id,
    displayId: toTaskDisplayId(taskRecord.number),
    title: taskRecord.title,
    description: taskRecord.description,
    status: taskRecord.status,
    priority: taskRecord.priority,
    dueDate: taskRecord.dueDate?.toISOString() ?? null,
    remindDaysBeforeDue: taskRecord.remindDaysBeforeDue,
    labels: taskRecord.labels.map((label) => label.name),
    parentTaskId: taskRecord.parentTaskId,
    assignedAgent: taskRecord.assignedAgent?.name ?? null,
    subtasks: taskRecord.subtasks.map(toSubtaskSummary),
  };
}

function toTaskBrief(taskRecord: Task) {
  return {
    id: taskRecord.id,
    displayId: toTaskDisplayId(taskRecord.number),
    title: taskRecord.title,
    status: taskRecord.status,
    priority: taskRecord.priority,
  };
}

type LabelResolution = { labelIds: string[] } | { error: string };

// Agents attach existing labels only, never create them (docs/tasks/prd.md,
// "Non-goals"). Unknown names come back as a tool error listing what's
// actually available, so the model can retry with a valid name.
async function resolveLabelIds({
  workspaceId,
  labelNames,
}: {
  workspaceId: string;
  labelNames: string[];
}): Promise<LabelResolution> {
  const labels = await listTaskLabels({ workspaceId });
  const idByName = new Map(labels.map((label) => [label.name, label.id]));

  const unknownNames = labelNames.filter((name) => !idByName.has(name));
  if (unknownNames.length > 0) {
    const available = labels.map((label) => label.name).join(', ') || 'none';
    return {
      error: `Unknown label name(s): ${unknownNames.join(', ')}. Available labels: ${available}.`,
    };
  }

  const labelIds: string[] = [];
  for (const name of labelNames) {
    const id = idByName.get(name);
    if (id) {
      labelIds.push(id);
    }
  }

  return { labelIds };
}

type ParentValidation = { ok: true } | { error: string };

// One-level subtask rule (docs/tasks/prd.md, "Goals"): a task with a
// `parentTaskId` of its own is rejected as a parent. Shared by createTask
// and updateTask.
async function validateParentTask({
  parentTaskId,
  workspaceId,
  taskIdBeingUpdated,
}: {
  parentTaskId: string;
  workspaceId: string;
  taskIdBeingUpdated?: string;
}): Promise<ParentValidation> {
  if (taskIdBeingUpdated && parentTaskId === taskIdBeingUpdated) {
    return { error: 'A task cannot be its own parent.' };
  }

  const parentTask = await getTaskById({ id: parentTaskId, workspaceId });
  if (!parentTask) {
    return { error: 'Parent task not found.' };
  }

  if (parentTask.parentTaskId !== null) {
    return { error: 'Cannot nest under a subtask; subtasks are one level deep.' };
  }

  return { ok: true };
}

// listTasks

const listTasksInputSchema = z.object({
  status: z
    .enum(TASK_STATUSES)
    .optional()
    .describe('Only return tasks in this status column. Omit to return every status.'),
});

type ListTasksInput = z.infer<typeof listTasksInputSchema>;
type ListTasksOutput = { tasks: ReturnType<typeof toTaskSummary>[] } | { error: string };

export const getListTasksTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  workspaceId: string,
): Tool<ListTasksInput, ListTasksOutput> =>
  tool({
    description:
      'List the tasks on the current workspace\'s board: display id (TSK-<number>), id, title, status, priority, due date, reminder offset, labels, parent task, assigned agent, and subtask count. Optionally filter by status.',
    inputSchema: listTasksInputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-task', data: { action: 'list' }, transient: true });

      const { error, data: tasks } = await tryCatch(
        () => listTasks({ workspaceId, status: input.status }),
        { retryOnFailure: false },
      );

      if (error !== null || !tasks) {
        return { error: toErrorMessage(error, 'Failed to list tasks.') };
      }

      return { tasks: tasks.map(toTaskSummary) };
    },
  });

// readTask

const readTaskInputSchema = z.object({
  id: z.string().describe('The id of the task to read.'),
});

type ReadTaskInput = z.infer<typeof readTaskInputSchema>;
type ReadTaskOutput = { task: ReturnType<typeof toTaskDetail> } | { error: string };

export const getReadTaskTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  workspaceId: string,
): Tool<ReadTaskInput, ReadTaskOutput> =>
  tool({
    description:
      'Read a single task in full by its id, including its markdown description and its subtasks.',
    inputSchema: readTaskInputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-task', data: { action: 'read', taskId: input.id }, transient: true });

      const { error, data: taskRecord } = await tryCatch(
        () => getTaskById({ id: input.id, workspaceId }),
        { retryOnFailure: false },
      );

      if (error !== null) {
        return { error: toErrorMessage(error, 'Failed to read task.') };
      }

      if (!taskRecord) {
        return { error: 'Task not found.' };
      }

      return { task: toTaskDetail(taskRecord) };
    },
  });

// createTask

const createTaskInputSchema = z.object({
  title: z.string().min(1).max(255).describe('The task title.'),
  description: z.string().optional().describe('Markdown description.'),
  status: z.enum(TASK_STATUSES).optional().describe('The status column. Defaults to "todo".'),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.string().optional().describe('ISO date string.'),
  remindDaysBeforeDue: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Days before the due date to send a reminder, 0 = on the due date. Requires `dueDate` to also be set.',
    ),
  parentTaskId: optionalNonEmptyString().describe(
    'Id of an existing top-level task to nest this one under (subtasks are one level deep). Null or omit for a top-level task.',
  ),
  labelNames: z
    .array(z.string())
    .optional()
    .describe('Names of existing workspace labels to attach (see listTaskLabels). Unknown names are rejected.'),
});

type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
type CreateTaskOutput = { task: ReturnType<typeof toTaskBrief> } | { error: string };

export const getCreateTaskTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  workspaceId: string,
  agentId: string,
): Tool<CreateTaskInput, CreateTaskOutput> =>
  tool({
    description:
      'Create a new task on the current workspace\'s board. Tasks you create are marked as agent-created.',
    inputSchema: createTaskInputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-task', data: { action: 'create' }, transient: true });

      // Ignore a reminder offset without a real due date instead of erroring.
      const remindDaysBeforeDue = input.dueDate ? input.remindDaysBeforeDue : undefined;

      if (input.parentTaskId) {
        const parentValidation = await validateParentTask({
          parentTaskId: input.parentTaskId,
          workspaceId,
        });
        if ('error' in parentValidation) {
          return parentValidation;
        }
      }

      let labelIds: string[] | undefined;
      if (input.labelNames && input.labelNames.length > 0) {
        const resolvedLabels = await resolveLabelIds({ workspaceId, labelNames: input.labelNames });
        if ('error' in resolvedLabels) {
          return resolvedLabels;
        }
        labelIds = resolvedLabels.labelIds;
      }

      const { error, data: createdTask } = await tryCatch(
        () =>
          createTask({
            workspaceId,
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            remindDaysBeforeDue,
            parentTaskId: input.parentTaskId,
            createdByAgentId: agentId,
            labelIds,
          }),
        { retryOnFailure: false },
      );

      if (error !== null || !createdTask) {
        return { error: toErrorMessage(error, 'Failed to create task.') };
      }

      return { task: toTaskBrief(createdTask) };
    },
  });

// updateTask

// Mirrors the repo's own `UpdateTaskFields` shape (task.repo.ts), which isn't
// exported. `status`/`sortOrder` are deliberately absent: the repo excludes
// them too, moving a task is `moveTask`'s job, not this tool's.
type TaskUpdateFields = {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: Date | null;
  remindDaysBeforeDue?: number | null;
  parentTaskId?: string | null;
  assignedAgentId?: string | null;
};

const updateTaskInputSchema = z.object({
  id: z.string().describe('The id of the task to update.'),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe('ISO date string to change the due date, or null to clear it (also clears the reminder).'),
  remindDaysBeforeDue: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe(
      'Days before the due date to send a reminder, 0 = on the due date, or null to turn the reminder off. Requires a due date (existing or set in the same call).',
    ),
  parentTaskId: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Id of an existing top-level task to nest this one under, or null to make this a top-level task again.',
    ),
  labelNames: z
    .array(z.string())
    .optional()
    .describe('Replaces the task\'s labels with these existing workspace labels (see listTaskLabels).'),
  assignedAgentId: optionalNonEmptyString().describe(
    'Agent id to assign this task to. Null or omit to leave unassigned.',
  ),
  unassign: z.boolean().optional().describe('Set true to remove the current agent assignment.'),
});

type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
type UpdateTaskOutput = { task: ReturnType<typeof toTaskBrief> } | { error: string };

export const getUpdateTaskTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  workspaceId: string,
): Tool<UpdateTaskInput, UpdateTaskOutput> =>
  tool({
    description:
      'Partially update a task: only the given fields change. Changing the due date or reminder offset re-arms the reminder. Does not change status; use moveTask for that.',
    inputSchema: updateTaskInputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-task', data: { action: 'update', taskId: input.id }, transient: true });

      const { error: loadError, data: currentTask } = await tryCatch(
        () => getTaskById({ id: input.id, workspaceId }),
        { retryOnFailure: false },
      );

      if (loadError !== null) {
        return { error: toErrorMessage(loadError, 'Failed to load task.') };
      }
      if (!currentTask) {
        return { error: 'Task not found.' };
      }

      const fields: TaskUpdateFields = {};
      if (input.title !== undefined) fields.title = input.title;
      if (input.description !== undefined) fields.description = input.description;
      if (input.priority !== undefined) fields.priority = input.priority;
      if (input.dueDate !== undefined) {
        fields.dueDate = input.dueDate === null ? null : new Date(input.dueDate);
      }
      if (input.remindDaysBeforeDue !== undefined) fields.remindDaysBeforeDue = input.remindDaysBeforeDue;
      if (input.parentTaskId !== undefined) fields.parentTaskId = input.parentTaskId;
      if (input.unassign) {
        fields.assignedAgentId = null;
      } else if (input.assignedAgentId) {
        fields.assignedAgentId = input.assignedAgentId;
      }

      const resolvedDueDate = 'dueDate' in fields ? fields.dueDate : currentTask.dueDate;
      if (
        'remindDaysBeforeDue' in fields &&
        fields.remindDaysBeforeDue !== null &&
        fields.remindDaysBeforeDue !== undefined &&
        resolvedDueDate === null
      ) {
        return { error: '`remindDaysBeforeDue` requires a due date.' };
      }

      if ('parentTaskId' in fields && fields.parentTaskId) {
        if (currentTask.subtasks.length > 0) {
          return { error: 'Cannot set a parent on a task that already has subtasks.' };
        }

        const parentValidation = await validateParentTask({
          parentTaskId: fields.parentTaskId,
          workspaceId,
          taskIdBeingUpdated: input.id,
        });
        if ('error' in parentValidation) {
          return parentValidation;
        }
      }

      let labelIds: string[] | undefined;
      if (input.labelNames) {
        const resolvedLabels = await resolveLabelIds({ workspaceId, labelNames: input.labelNames });
        if ('error' in resolvedLabels) {
          return resolvedLabels;
        }
        labelIds = resolvedLabels.labelIds;
      }

      const { error, data: updatedTask } = await tryCatch(
        () => updateTask({ id: input.id, workspaceId, labelIds, ...fields }),
        { retryOnFailure: false },
      );

      if (error !== null || !updatedTask) {
        return { error: toErrorMessage(error, 'Failed to update task.') };
      }

      return { task: toTaskBrief(updatedTask) };
    },
  });

// moveTask

const moveTaskInputSchema = z.object({
  id: z.string().describe('The id of the task to move.'),
  status: z.enum(TASK_STATUSES).describe('The destination status column.'),
  position: z
    .enum(['top', 'bottom'])
    .default('bottom')
    .describe('Where to place the task within the destination column.'),
});

type MoveTaskInput = z.infer<typeof moveTaskInputSchema>;
type MoveTaskOutput = { task: ReturnType<typeof toTaskBrief> } | { error: string };

// Bottom is "after the column's current last card"; top is "no afterTaskId",
// matching moveTask's own convention (task.repo.ts). The moving task itself
// is excluded from the candidates: if it's already the last card in the
// destination column, it would otherwise resolve as its own anchor, and the
// repo's moveTask rejects an afterTaskId that doesn't belong to the column
// once it excludes the task being moved.
async function resolveAfterTaskId({
  taskId,
  workspaceId,
  status,
  position,
}: {
  taskId: string;
  workspaceId: string;
  status: TaskStatus;
  position: 'top' | 'bottom';
}): Promise<string | undefined> {
  if (position === 'top') {
    return undefined;
  }

  const columnTasks = await listTasks({ workspaceId, status });
  return columnTasks.filter((columnTask) => columnTask.id !== taskId).at(-1)?.id;
}

export const getMoveTaskTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  workspaceId: string,
): Tool<MoveTaskInput, MoveTaskOutput> =>
  tool({
    description: 'Move a task to a different status column, at the top or bottom of it.',
    inputSchema: moveTaskInputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-task', data: { action: 'move', taskId: input.id }, transient: true });

      const { error, data: movedTask } = await tryCatch(
        async () => {
          const afterTaskId = await resolveAfterTaskId({
            taskId: input.id,
            workspaceId,
            status: input.status,
            position: input.position,
          });
          return moveTask({ id: input.id, workspaceId, status: input.status, afterTaskId });
        },
        { retryOnFailure: false },
      );

      if (error !== null) {
        return { error: toErrorMessage(error, 'Failed to move task.') };
      }
      if (!movedTask) {
        return { error: 'Task not found.' };
      }

      return { task: toTaskBrief(movedTask) };
    },
  });

export type ListTasksToolInput = InferToolInput<ReturnType<typeof getListTasksTool>>;
export type ListTasksToolOutput = InferToolOutput<ReturnType<typeof getListTasksTool>>;
export type ListTasksUiTool = InferUITool<ReturnType<typeof getListTasksTool>>;

export type ReadTaskToolInput = InferToolInput<ReturnType<typeof getReadTaskTool>>;
export type ReadTaskToolOutput = InferToolOutput<ReturnType<typeof getReadTaskTool>>;
export type ReadTaskUiTool = InferUITool<ReturnType<typeof getReadTaskTool>>;

export type CreateTaskToolInput = InferToolInput<ReturnType<typeof getCreateTaskTool>>;
export type CreateTaskToolOutput = InferToolOutput<ReturnType<typeof getCreateTaskTool>>;
export type CreateTaskUiTool = InferUITool<ReturnType<typeof getCreateTaskTool>>;

export type UpdateTaskToolInput = InferToolInput<ReturnType<typeof getUpdateTaskTool>>;
export type UpdateTaskToolOutput = InferToolOutput<ReturnType<typeof getUpdateTaskTool>>;
export type UpdateTaskUiTool = InferUITool<ReturnType<typeof getUpdateTaskTool>>;

export type MoveTaskToolInput = InferToolInput<ReturnType<typeof getMoveTaskTool>>;
export type MoveTaskToolOutput = InferToolOutput<ReturnType<typeof getMoveTaskTool>>;
export type MoveTaskUiTool = InferUITool<ReturnType<typeof getMoveTaskTool>>;
