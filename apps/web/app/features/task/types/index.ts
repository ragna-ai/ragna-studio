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

export const TASK_PRIORITIES = ['none', 'urgent', 'high', 'medium', 'low'] as const;
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

/** Board/list row: what GET /task returns (specs/tasks/prd.md, "List"). */
export interface TaskWithBoardInfo extends Task {
  labels: TaskLabel[];
  assignedAgent: TaskAssignedAgent | null;
  subtaskCount: number;
  // Subtasks with status 'done', for the board card's "2/5" progress.
  subtaskDoneCount: number;
}

/** Task detail: what GET /task/:taskId returns. */
export interface TaskWithDetails extends Task {
  labels: TaskLabel[];
  assignedAgent: TaskAssignedAgent | null;
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
