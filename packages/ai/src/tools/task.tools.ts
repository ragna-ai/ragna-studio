import type {
  MediaTextExtractionStatus,
  Task,
  TaskAttachmentWithMediaSummary,
  TaskPriority,
  TaskStatus,
  TaskWithBoardInfo,
  TaskWithDetails,
} from '@repo/database';
import {
  createTask,
  createTaskComment,
  getTaskAttachmentById,
  getTaskAttachmentsByTaskId,
  getTaskById,
  listTasks,
  listTaskLabels,
  MAX_COMMENTS_PER_TASK,
  MAX_TASK_COMMENT_BODY_LENGTH,
  moveTask,
  taskRunOutcomes,
  updateTask,
} from '@repo/database';
import { getMediaKindByMimeType, isExtractableKind } from '@repo/media';
import * as z from 'zod';
import { failOnForeignReference } from './foreign-reference-failure';
import type { AnyToolDefinition, ToolDefinition, ToolFailure } from './tool-definition';
import { optionalNonEmptyString } from './zod-helpers';

// Workspace-scoped: a task always belongs to a workspace (the workspace is
// the board), and every chat (and therefore every tool
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
// No delete tool: the Canceled status covers abandonment.

const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
] as const satisfies readonly TaskStatus[];
const TASK_PRIORITIES = [
  'none',
  'urgent',
  'high',
  'medium',
  'low',
] as const satisfies readonly TaskPriority[];

function toTaskDisplayId(taskNumber: number): string {
  return `TSK-${taskNumber}`;
}

export interface TaskToolDefinitionsOptions {
  /** Marks the tasks the create tool makes as agent-created. */
  agentId: string;
  /** True while the agent works a task run: the create tool then refuses. */
  inTaskRun?: boolean;
}

const TASK_NOT_FOUND: ToolFailure<'not_found'> = {
  status: 'not_found',
  message: 'Task not found.',
};

const TASK_RUN_ACTIVE: ToolFailure<'task_run_active'> = {
  status: 'task_run_active',
  message:
    'An agent run is working on this task, so it cannot be changed. Stop the run first. Nothing was changed.',
};

const taskStatusSchema = z.enum(TASK_STATUSES);
const taskPrioritySchema = z.enum(TASK_PRIORITIES);

const taskBriefSchema = z.strictObject({
  id: z.string(),
  displayId: z.string(),
  title: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
});

const taskSummarySchema = z.strictObject({
  id: z.string(),
  displayId: z.string(),
  title: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueDate: z.string().nullable(),
  remindDaysBeforeDue: z.number().nullable(),
  labels: z.array(z.string()),
  parentTaskId: z.string().nullable(),
  assignedAgent: z.string().nullable(),
  subtaskCount: z.number(),
});

const subtaskSummarySchema = z.strictObject({
  id: z.string(),
  displayId: z.string(),
  title: z.string(),
  status: taskStatusSchema,
});

const taskAttachmentSummarySchema = z.strictObject({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});

const taskDetailSchema = z.strictObject({
  id: z.string(),
  displayId: z.string(),
  title: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueDate: z.string().nullable(),
  remindDaysBeforeDue: z.number().nullable(),
  labels: z.array(z.string()),
  parentTaskId: z.string().nullable(),
  assignedAgent: z.string().nullable(),
  subtasks: z.array(subtaskSummarySchema),
  attachments: z.array(taskAttachmentSummarySchema),
});

type TaskBrief = z.infer<typeof taskBriefSchema>;
type TaskSummary = z.infer<typeof taskSummarySchema>;
type SubtaskSummary = z.infer<typeof subtaskSummarySchema>;
type TaskDetail = z.infer<typeof taskDetailSchema>;
type TaskAttachmentSummary = z.infer<typeof taskAttachmentSummarySchema>;

function toTaskSummary(taskRecord: TaskWithBoardInfo): TaskSummary {
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

function toSubtaskSummary(subtask: Task): SubtaskSummary {
  return {
    id: subtask.id,
    displayId: toTaskDisplayId(subtask.number),
    title: subtask.title,
    status: subtask.status,
  };
}

function toTaskAttachmentSummary(
  attachment: TaskAttachmentWithMediaSummary,
): TaskAttachmentSummary {
  return {
    id: attachment.id,
    filename: attachment.media.filename,
    mimeType: attachment.media.mimeType,
    sizeBytes: attachment.media.size,
  };
}

function toTaskDetail(
  taskRecord: TaskWithDetails,
  attachments: TaskAttachmentWithMediaSummary[],
): TaskDetail {
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
    attachments: attachments.map(toTaskAttachmentSummary),
  };
}

function toTaskBrief(taskRecord: Task): TaskBrief {
  return {
    id: taskRecord.id,
    displayId: toTaskDisplayId(taskRecord.number),
    title: taskRecord.title,
    status: taskRecord.status,
    priority: taskRecord.priority,
  };
}

type LabelResolution = { labelIds: string[] } | ToolFailure<'invalid_input'>;

// Agents attach existing labels only, never create them.
// Unknown names come back as a tool failure listing what's
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
      status: 'invalid_input',
      message: `Unknown label name(s): ${unknownNames.join(', ')}. Available labels: ${available}.`,
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

type ParentFailure = ToolFailure<'not_found' | 'invalid_input'>;

// One-level subtask rule: a task with a
// `parentTaskId` of its own is rejected as a parent. Shared by createTask
// and updateTask. Returns null when the parent is valid.
async function findParentTaskFailure({
  parentTaskId,
  workspaceId,
  taskIdBeingUpdated,
}: {
  parentTaskId: string;
  workspaceId: string;
  taskIdBeingUpdated?: string;
}): Promise<ParentFailure | null> {
  if (taskIdBeingUpdated && parentTaskId === taskIdBeingUpdated) {
    return { status: 'invalid_input', message: 'A task cannot be its own parent.' };
  }

  const parentTask = await getTaskById({ id: parentTaskId, workspaceId });
  if (!parentTask) {
    return { status: 'not_found', message: 'Parent task not found.' };
  }

  if (parentTask.parentTaskId !== null) {
    return {
      status: 'invalid_input',
      message: 'Cannot nest under a subtask; subtasks are one level deep.',
    };
  }

  return null;
}

// listTasks

const listTasksInputSchema = z.object({
  status: z
    .enum(TASK_STATUSES)
    .optional()
    .describe('Only return tasks in this status column. Omit to return every status.'),
});

const listTasksOutputSchema = z.strictObject({ tasks: z.array(taskSummarySchema) });

const listTasksDefinition: ToolDefinition<
  typeof listTasksInputSchema,
  typeof listTasksOutputSchema
> = {
  name: 'listTasks',
  description:
    "List the tasks on the current workspace's board: display id (TSK-<number>), id, title, status, priority, due date, reminder offset, labels, parent task, assigned agent, and subtask count. Optionally filter by status.",
  inputSchema: listTasksInputSchema,
  outputSchema: listTasksOutputSchema,
  access: 'read',
  execute: async ({ status }, { workspaceId }) => {
    const tasks = await listTasks({ workspaceId, status });
    return { tasks: tasks.map(toTaskSummary) };
  },
};

// readTask

const readTaskInputSchema = z.object({
  id: z.string().describe('The id of the task to read.'),
});

const readTaskOutputSchema = z.strictObject({ task: taskDetailSchema });

const readTaskDefinition: ToolDefinition<
  typeof readTaskInputSchema,
  typeof readTaskOutputSchema,
  'not_found'
> = {
  name: 'readTask',
  description:
    'Read a single task in full by its id, including its markdown description and its subtasks.',
  inputSchema: readTaskInputSchema,
  outputSchema: readTaskOutputSchema,
  access: 'read',
  execute: async ({ id }, { workspaceId }) => {
    const taskRecord = await getTaskById({ id, workspaceId });
    if (!taskRecord) {
      return TASK_NOT_FOUND;
    }
    const attachments = await getTaskAttachmentsByTaskId({ taskId: taskRecord.id });
    return { task: toTaskDetail(taskRecord, attachments) };
  },
};

// readTaskAttachment

const readTaskAttachmentInputSchema = z.object({
  taskId: z.string().describe('The id of the task the file is attached to.'),
  attachmentId: z.string().describe("The attachment id from the task's attachments list."),
});

const readTaskAttachmentOutputSchema = z.strictObject({
  filename: z.string(),
  mimeType: z.string(),
  text: z.string(),
  truncated: z.boolean(),
});

type ReadTaskAttachmentFailureStatus = 'not_found' | 'not_ready' | 'not_readable';

interface ReadableAttachmentMedia {
  filename: string;
  mimeType: string;
  textExtractionStatus: MediaTextExtractionStatus | null;
  extractedText: string | null;
}

/** Why an attachment's text can't be returned right now, or null when it can. */
function describeUnreadableAttachment(
  media: ReadableAttachmentMedia,
): ToolFailure<ReadTaskAttachmentFailureStatus> | null {
  const { filename } = media;
  const kind = getMediaKindByMimeType(media.mimeType);

  switch (media.textExtractionStatus) {
    case 'pending':
      return {
        status: 'not_ready',
        message: `The text of "${filename}" is still being extracted. Try again later.`,
      };
    case 'failed':
      return { status: 'not_readable', message: `Text extraction failed for "${filename}".` };
    case 'ready':
      return media.extractedText
        ? null
        : {
            status: 'not_readable',
            message: `"${filename}" contains no readable text (it may be a scanned document).`,
          };
    case null:
      return {
        status: 'not_readable',
        message:
          kind && isExtractableKind(kind)
            ? `"${filename}" has no extracted text.`
            : `"${filename}" is an image; its text can't be read.`,
      };
  }
}

const readTaskAttachmentDefinition: ToolDefinition<
  typeof readTaskAttachmentInputSchema,
  typeof readTaskAttachmentOutputSchema,
  ReadTaskAttachmentFailureStatus
> = {
  name: 'readTaskAttachment',
  description:
    "Read the text of a file attached to a task. Works for PDF, Word, PowerPoint, Excel, CSV, text and Markdown files. Images can't be read. Long files are cut off and marked truncated. Get the attachment id from readTask.",
  inputSchema: readTaskAttachmentInputSchema,
  outputSchema: readTaskAttachmentOutputSchema,
  access: 'read',
  execute: async ({ taskId, attachmentId }, { workspaceId }) => {
    const taskRecord = await getTaskById({ id: taskId, workspaceId });
    if (!taskRecord) {
      return TASK_NOT_FOUND;
    }

    const attachment = await getTaskAttachmentById({ id: attachmentId });
    if (!attachment || attachment.taskId !== taskId) {
      return { status: 'not_found', message: 'Attachment not found on this task.' };
    }

    const { media } = attachment;
    const failure = describeUnreadableAttachment(media);
    if (failure) {
      return failure;
    }

    return {
      filename: media.filename,
      mimeType: media.mimeType,
      text: media.extractedText ?? '',
      truncated: media.extractedTextTruncated,
    };
  },
};

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
    .describe(
      'Names of existing workspace labels to attach (see listTaskLabels). Unknown names are rejected.',
    ),
});

const taskBriefOutputSchema = z.strictObject({ task: taskBriefSchema });

type TaskBriefOutput = z.infer<typeof taskBriefOutputSchema>;
type TaskInputFailure = ToolFailure<'not_found' | 'invalid_input'>;
type TaskWriteFailure = TaskInputFailure | ToolFailure<'task_run_active'>;

const CREATE_TASK_REFUSED_IN_RUN: ToolFailure<'not_allowed_in_run'> = {
  status: 'not_allowed_in_run',
  message:
    'You cannot create tasks while working on a task. List the steps in your summary instead.',
};

function createTaskDefinition({
  agentId,
  inTaskRun,
}: TaskToolDefinitionsOptions): ToolDefinition<
  typeof createTaskInputSchema,
  typeof taskBriefOutputSchema,
  'not_found' | 'invalid_input' | 'not_allowed_in_run'
> {
  return {
    name: 'createTask',
    description:
      "Create a new task on the current workspace's board. Tasks you create are marked as agent-created.",
    inputSchema: createTaskInputSchema,
    outputSchema: taskBriefOutputSchema,
    access: 'write',
    execute: async (input, { workspaceId }) => {
      if (inTaskRun) return CREATE_TASK_REFUSED_IN_RUN;
      return failOnForeignReference<TaskBriefOutput | TaskInputFailure>(async () => {
        // Ignore a reminder offset without a real due date instead of erroring.
        const remindDaysBeforeDue = input.dueDate ? input.remindDaysBeforeDue : undefined;

        if (input.parentTaskId) {
          const parentFailure = await findParentTaskFailure({
            parentTaskId: input.parentTaskId,
            workspaceId,
          });
          if (parentFailure) {
            return parentFailure;
          }
        }

        let labelIds: string[] | undefined;
        if (input.labelNames && input.labelNames.length > 0) {
          const resolvedLabels = await resolveLabelIds({
            workspaceId,
            labelNames: input.labelNames,
          });
          if ('status' in resolvedLabels) {
            return resolvedLabels;
          }
          labelIds = resolvedLabels.labelIds;
        }

        const createdTask = await createTask({
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
        });

        return { task: toTaskBrief(createdTask) };
      });
    },
  };
}

// updateTask

// Mirrors the repo's own `UpdateTaskFields` shape (task.repo.ts), which isn't
// exported. `status`/`sortOrder` are deliberately absent: the repo excludes
// them too, moving a task is `moveTask`'s job, not this tool's.
interface TaskUpdateFields {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: Date | null;
  remindDaysBeforeDue?: number | null;
  parentTaskId?: string | null;
  assignedAgentId?: string | null;
}

const updateTaskInputSchema = z.object({
  id: z.string().describe('The id of the task to update.'),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .describe(
      'ISO date string to change the due date, or null to clear it (also clears the reminder).',
    ),
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
    .describe(
      "Replaces the task's labels with these existing workspace labels (see listTaskLabels).",
    ),
  assignedAgentId: optionalNonEmptyString().describe(
    'Agent id to assign this task to. Null or omit to leave unassigned.',
  ),
  unassign: z.boolean().optional().describe('Set true to remove the current agent assignment.'),
});

const updateTaskDefinition: ToolDefinition<
  typeof updateTaskInputSchema,
  typeof taskBriefOutputSchema,
  'not_found' | 'invalid_input' | 'task_run_active'
> = {
  name: 'updateTask',
  description:
    'Partially update a task: only the given fields change. Changing the due date or reminder offset re-arms the reminder. Does not change status; use moveTask for that.',
  inputSchema: updateTaskInputSchema,
  outputSchema: taskBriefOutputSchema,
  access: 'write',
  execute: (input, { workspaceId }) =>
    failOnForeignReference<TaskBriefOutput | TaskWriteFailure>(async () => {
      const currentTask = await getTaskById({ id: input.id, workspaceId });
      if (!currentTask) {
        return TASK_NOT_FOUND;
      }

      const fields: TaskUpdateFields = {};
      if (input.title !== undefined) fields.title = input.title;
      if (input.description !== undefined) fields.description = input.description;
      if (input.priority !== undefined) fields.priority = input.priority;
      if (input.dueDate !== undefined) {
        fields.dueDate = input.dueDate === null ? null : new Date(input.dueDate);
      }
      if (input.remindDaysBeforeDue !== undefined)
        fields.remindDaysBeforeDue = input.remindDaysBeforeDue;
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
        return {
          status: 'invalid_input',
          message: '`remindDaysBeforeDue` requires a due date.',
        };
      }

      if ('parentTaskId' in fields && fields.parentTaskId) {
        if (currentTask.subtasks.length > 0) {
          return {
            status: 'invalid_input',
            message: 'Cannot set a parent on a task that already has subtasks.',
          };
        }

        const parentFailure = await findParentTaskFailure({
          parentTaskId: fields.parentTaskId,
          workspaceId,
          taskIdBeingUpdated: input.id,
        });
        if (parentFailure) {
          return parentFailure;
        }
      }

      let labelIds: string[] | undefined;
      if (input.labelNames) {
        const resolvedLabels = await resolveLabelIds({ workspaceId, labelNames: input.labelNames });
        if ('status' in resolvedLabels) {
          return resolvedLabels;
        }
        labelIds = resolvedLabels.labelIds;
      }

      const result = await updateTask({ id: input.id, workspaceId, labelIds, ...fields });
      if (result.status === 'not-found') {
        return TASK_NOT_FOUND;
      }
      if (result.status === 'run-active') {
        return TASK_RUN_ACTIVE;
      }
      return { task: toTaskBrief(result.task) };
    }),
};

// moveTask

const moveTaskInputSchema = z.object({
  id: z.string().describe('The id of the task to move.'),
  status: z.enum(TASK_STATUSES).describe('The destination status column.'),
  position: z
    .enum(['top', 'bottom'])
    .default('bottom')
    .describe('Where to place the task within the destination column.'),
});

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

const moveTaskDefinition: ToolDefinition<
  typeof moveTaskInputSchema,
  typeof taskBriefOutputSchema,
  'not_found' | 'task_run_active'
> = {
  name: 'moveTask',
  description: 'Move a task to a different status column, at the top or bottom of it.',
  inputSchema: moveTaskInputSchema,
  outputSchema: taskBriefOutputSchema,
  access: 'write',
  execute: async ({ id, status, position }, { workspaceId }) => {
    const afterTaskId = await resolveAfterTaskId({ taskId: id, workspaceId, status, position });
    const result = await moveTask({ id, workspaceId, status, afterTaskId });
    if (result.status === 'not-found') {
      return TASK_NOT_FOUND;
    }
    if (result.status === 'run-active') {
      return TASK_RUN_ACTIVE;
    }
    return { task: toTaskBrief(result.task) };
  },
};

// addTaskComment

const addTaskCommentInputSchema = z.object({
  taskId: z.string().describe('The id of the task to comment on.'),
  body: z
    .string()
    .min(1)
    .max(MAX_TASK_COMMENT_BODY_LENGTH)
    .describe('The comment text in markdown.'),
});

const addTaskCommentOutputSchema = z.strictObject({
  comment: z.strictObject({ id: z.string(), taskId: z.string(), displayId: z.string() }),
});

type AddTaskCommentOutput = z.infer<typeof addTaskCommentOutputSchema>;
type AddTaskCommentFailureStatus = 'not_found' | 'limit_reached' | 'other_task' | 'notes_exhausted';
type AddTaskCommentFailure = ToolFailure<AddTaskCommentFailureStatus>;

const TASK_COMMENT_LIMIT_REACHED: ToolFailure<'limit_reached'> = {
  status: 'limit_reached',
  message: `The task already holds the maximum of ${MAX_COMMENTS_PER_TASK} comments. No comment was added.`,
};

/** The task run an `addTaskComment` call belongs to. */
export interface TaskRunBinding {
  taskId: string;
  taskRunId: string;
}

export const MAX_NOTES_PER_TASK_RUN = 5;

const OTHER_TASK_FAILURE: ToolFailure<'other_task'> = {
  status: 'other_task',
  message: 'You can only comment on the task you are working on. No comment was added.',
};

const NOTES_EXHAUSTED_FAILURE: ToolFailure<'notes_exhausted'> = {
  status: 'notes_exhausted',
  message: `You already added ${MAX_NOTES_PER_TASK_RUN} notes in this run. Put the rest in your summary when you finish. No comment was added.`,
};

interface AddTaskCommentOptions {
  agentId: string;
  /** Set for a task run: comments go to that task only, are tagged with the run and are capped. */
  run?: TaskRunBinding;
}

function addTaskCommentDefinition({
  agentId,
  run,
}: AddTaskCommentOptions): ToolDefinition<
  typeof addTaskCommentInputSchema,
  typeof addTaskCommentOutputSchema,
  AddTaskCommentFailureStatus
> {
  return {
    name: 'addTaskComment',
    description: `Add a comment to a task. The comment is shown under your name, appears last on the task and cannot be edited by users. A task holds at most ${MAX_COMMENTS_PER_TASK} comments.`,
    inputSchema: addTaskCommentInputSchema,
    outputSchema: addTaskCommentOutputSchema,
    access: 'write',
    execute: ({ taskId, body }, { workspaceId }) =>
      failOnForeignReference<AddTaskCommentOutput | AddTaskCommentFailure>(async () => {
        if (run && taskId !== run.taskId) return OTHER_TASK_FAILURE;

        const taskRecord = await getTaskById({ id: taskId, workspaceId });
        if (!taskRecord) {
          return TASK_NOT_FOUND;
        }

        const result = await createTaskComment({
          workspaceId,
          taskId,
          author: { kind: 'agent', agentId },
          body,
          taskRunId: run?.taskRunId,
          maxCommentsOfRun: run ? MAX_NOTES_PER_TASK_RUN : undefined,
        });
        if (result.status === 'task-not-found') {
          return TASK_NOT_FOUND;
        }
        if (result.status === 'limit-reached') {
          return TASK_COMMENT_LIMIT_REACHED;
        }
        if (result.status === 'run-note-limit-reached') {
          return NOTES_EXHAUSTED_FAILURE;
        }

        return {
          comment: {
            id: result.commentId,
            taskId,
            displayId: toTaskDisplayId(taskRecord.number),
          },
        };
      }),
  };
}

// finishTaskRun

export const FINISH_TASK_RUN_TOOL_NAME = 'finishTaskRun';

export const finishTaskRunInputSchema = z.object({
  outcome: z
    .enum(taskRunOutcomes)
    .describe(
      '"completed" when the work is done, "needs_input" when you are blocked and need an answer from a person.',
    ),
  summary: z
    .string()
    .min(1)
    .describe('What you did, what you found and what is left. Markdown. Shown on the task.'),
});

export type FinishTaskRunInput = z.infer<typeof finishTaskRunInputSchema>;

const finishTaskRunOutputSchema = z.strictObject({
  outcome: z.enum(taskRunOutcomes),
  summary: z.string(),
});

/** Ends the run. The runner reads the call, writes the result comment and moves the task. */
const finishTaskRunDefinition: ToolDefinition<
  typeof finishTaskRunInputSchema,
  typeof finishTaskRunOutputSchema
> = {
  name: FINISH_TASK_RUN_TOOL_NAME,
  description:
    'Call this exactly once, as your last action, to end your work on the task. Give the outcome and a summary of what you did. Nothing happens after this call.',
  inputSchema: finishTaskRunInputSchema,
  outputSchema: finishTaskRunOutputSchema,
  access: 'read',
  execute: async ({ outcome, summary }) => ({ outcome, summary }),
};

export interface TaskRunToolDefinitionsOptions extends TaskRunBinding {
  agentId: string;
}

/** The tools only a task run has: comments bound to the run, and the call that ends it. */
export function taskRunToolDefinitions({
  agentId,
  taskId,
  taskRunId,
}: TaskRunToolDefinitionsOptions): AnyToolDefinition[] {
  return [
    addTaskCommentDefinition({ agentId, run: { taskId, taskRunId } }),
    finishTaskRunDefinition,
  ];
}

/** The task tools of one agent. */
export function taskToolDefinitions(options: TaskToolDefinitionsOptions): AnyToolDefinition[] {
  return [
    listTasksDefinition,
    readTaskDefinition,
    readTaskAttachmentDefinition,
    createTaskDefinition(options),
    updateTaskDefinition,
    moveTaskDefinition,
    addTaskCommentDefinition(options),
  ];
}
