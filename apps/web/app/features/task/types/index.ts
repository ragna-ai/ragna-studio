// Single source of truth for both the TS union type and runtime validation:
// `as const` tuples so `z.enum(...)` (see TaskCreateDialog.vue and friends)
// can derive a schema whose parsed output IS `TaskStatus`/`TaskPriority`,
// instead of widening to `string` and forcing a cast at every call site.
// Fixed Linear-style columns: no columns
// table, this order drives both the board and the list view's grouping.
export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = [
  'none',
  'urgent',
  'high',
  'medium',
  'low',
] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskLabel {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAssignedAgent {
  id: string;
  name: string;
}

// Plain task row, as returned by create/update/move (no joined data).
export interface Task {
  id: string;
  workspaceId: string;
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  sortOrder: string;
  dueDate: string | null;
  remindDaysBeforeDue: number | null;
  reminderSentAt: string | null;
  parentTaskId: string | null;
  assignedAgentId: string | null;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type TaskRunOutcome = 'completed' | 'needs_input';

/** The queued or running run of a task, if any. */
export interface TaskActiveRun {
  id: string;
  status: 'queued' | 'running';
}

/** Board/list row: what GET /task returns. */
export interface TaskWithBoardInfo extends Task {
  labels: TaskLabel[];
  assignedAgent: TaskAssignedAgent | null;
  activeRun: TaskActiveRun | null;
  subtaskCount: number;
  // Subtasks with status 'done', for the board card's "2/5" progress.
  subtaskDoneCount: number;
}

/** Task detail: what GET /task/:taskId returns. */
export interface TaskWithDetails extends Task {
  labels: TaskLabel[];
  assignedAgent: TaskAssignedAgent | null;
  activeRun: TaskActiveRun | null;
  subtasks: Task[];
}

export interface TaskListResponse {
  tasks: TaskWithBoardInfo[];
}

export interface TaskDetailResponse {
  task: TaskWithDetails;
}

// Create/update/move all return a bare Task (no joined data), matching
// apps/api/src/controllers/task.controller.ts.
export interface TaskResponse {
  task: Task;
}

export interface TaskListFilters {
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
  taskLabelId?: string | null;
}

export type CreateTaskRequest = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  remindDaysBeforeDue?: number | null;
  parentTaskId?: string | null;
  assignedAgentId?: string | null;
  labelIds?: string[];
};

// PATCH never accepts status/sortOrder: moving is the dedicated /move action.
export type UpdateTaskRequest = {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  remindDaysBeforeDue?: number | null;
  parentTaskId?: string | null;
  assignedAgentId?: string | null;
  labelIds?: string[];
};

export type MoveTaskRequest = {
  status: TaskStatus;
  // Omitted = top of the column.
  afterTaskId?: string | null;
};

export interface TaskLabelResponse {
  taskLabel: TaskLabel;
}

export interface TaskLabelManyResponse {
  taskLabels: TaskLabel[];
}

export type CreateTaskLabelRequest = {
  name: string;
  color: string;
};

export type UpdateTaskLabelRequest = Partial<CreateTaskLabelRequest>;

export interface TaskCommentUserAuthor {
  kind: 'user';
  id: string | null;
  name: string | null;
}

export interface TaskCommentAgentAuthor {
  kind: 'agent';
  id: string | null;
  name: string | null;
  icon: string | null;
  tone: string | null;
}

export type TaskCommentAuthor = TaskCommentUserAuthor | TaskCommentAgentAuthor;

export interface TaskComment {
  id: string;
  taskId: string;
  body: string;
  taskRunId: string | null;
  editedAt: string | null;
  createdAt: string;
  author: TaskCommentAuthor;
  canEdit: boolean;
  canDelete: boolean;
}

export interface TaskCommentManyResponse {
  comments: TaskComment[];
}

export interface TaskCommentResponse {
  comment: TaskComment;
}

export interface TaskRunAgent {
  id: string;
  name: string;
  icon: string | null;
  tone: string | null;
}

export interface TaskRunTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface TaskRunToolCall {
  toolName: string;
  input: unknown;
  output: unknown;
  error?: string;
}

export interface TaskRunTraceStep {
  text?: string;
  usage: TaskRunTokenUsage;
  toolCalls: TaskRunToolCall[];
}

export interface TaskRunUsage {
  inputTokens: number;
  outputTokens: number;
  credits: number;
}

export interface TaskRun {
  id: string;
  taskId: string;
  status: TaskRunStatus;
  outcome: TaskRunOutcome | null;
  error: string | null;
  agent: TaskRunAgent | null;
  agentVersion: { id: string; versionNumber: number } | null;
  startedBy: { id: string; name: string } | null;
  trace: TaskRunTraceStep[];
  usage: TaskRunUsage | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface TaskRunResponse {
  run: TaskRun;
}

export interface TaskRunManyResponse {
  runs: TaskRun[];
}

export interface CancelAllTaskRunsResponse {
  canceledCount: number;
}
