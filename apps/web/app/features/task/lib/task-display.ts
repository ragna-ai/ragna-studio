import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '~/features/task/types';

/** `TSK-<number>` display id. */
export function formatTaskDisplayId(taskNumber: number): string {
  return `TSK-${taskNumber}`;
}

export interface TaskStatusOption {
  value: TaskStatus;
  labelKey: string;
  icon: string;
  iconClass: string;
}

export interface TaskPriorityOption {
  value: TaskPriority;
  labelKey: string;
  icon: string;
  iconClass: string;
}

const STATUS_DISPLAY = {
  backlog: {
    value: 'backlog',
    labelKey: 'task.status.backlog',
    icon: 'hugeicons:circle-dashed',
    iconClass: 'text-icon',
  },
  todo: {
    value: 'todo',
    labelKey: 'task.status.todo',
    icon: 'hugeicons:progress-01',
    iconClass: 'text-icon',
  },
  in_progress: {
    value: 'in_progress',
    labelKey: 'task.status.in_progress',
    icon: 'hugeicons:progress-03',
    iconClass: 'text-icon',
  },
  in_review: {
    value: 'in_review',
    labelKey: 'task.status.in_review',
    icon: 'hugeicons:progress-04',
    iconClass: 'text-icon',
  },
  done: {
    value: 'done',
    labelKey: 'task.status.done',
    icon: 'hugeicons:checkmark-circle-02',
    iconClass: 'text-status-ok-fg',
  },
  canceled: {
    value: 'canceled',
    labelKey: 'task.status.canceled',
    icon: 'hugeicons:cancel-circle',
    iconClass: 'text-muted-foreground',
  },
} satisfies Record<TaskStatus, TaskStatusOption>;

const PRIORITY_DISPLAY = {
  none: {
    value: 'none',
    labelKey: 'task.priority.none',
    icon: 'hugeicons:minus-sign',
    iconClass: 'text-icon',
  },
  urgent: {
    value: 'urgent',
    labelKey: 'task.priority.urgent',
    icon: 'hugeicons:alert-02',
    iconClass: 'text-status-warn-fg',
  },
  high: {
    value: 'high',
    labelKey: 'task.priority.high',
    icon: 'hugeicons:signal-full-02',
    iconClass: 'text-icon',
  },
  medium: {
    value: 'medium',
    labelKey: 'task.priority.medium',
    icon: 'hugeicons:signal-medium-02',
    iconClass: 'text-icon',
  },
  low: {
    value: 'low',
    labelKey: 'task.priority.low',
    icon: 'hugeicons:signal-low-02',
    iconClass: 'text-icon',
  },
} satisfies Record<TaskPriority, TaskPriorityOption>;

export const STATUS_COLUMNS: TaskStatusOption[] = TASK_STATUSES.map(
  (status) => STATUS_DISPLAY[status],
);

export const PRIORITY_OPTIONS: TaskPriorityOption[] = TASK_PRIORITIES.map(
  (priority) => PRIORITY_DISPLAY[priority],
);

export function priorityOption(priority: TaskPriority): TaskPriorityOption {
  return PRIORITY_DISPLAY[priority];
}

export function statusOption(status: TaskStatus): TaskStatusOption {
  return STATUS_DISPLAY[status];
}

export function statusLabelKey(status: TaskStatus): string {
  return STATUS_DISPLAY[status].labelKey;
}

// shadcn's Select emits its generic `AcceptableValue` (string | Record<string,
// unknown> | null), not `TaskStatus`/`TaskPriority`, so every select bound to
// one of these fields needs to narrow the emitted value before handing it to
// a typed setter. These guards are the single place that narrowing happens,
// instead of a bare `as TaskStatus`/`as TaskPriority` cast at each call site.
export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === 'string' &&
    (TASK_STATUSES as readonly string[]).includes(value)
  );
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === 'string' &&
    (TASK_PRIORITIES as readonly string[]).includes(value)
  );
}

/** A due date is only "overdue" styling if the task isn't already settled. */
export function isTaskOverdue(task: Pick<Task, 'dueDate' | 'status'>): boolean {
  if (!task.dueDate) {
    return false;
  }
  if (task.status === 'done' || task.status === 'canceled') {
    return false;
  }
  return new Date(task.dueDate).getTime() < Date.now();
}

// Reminder select presets: each maps
// directly to remindDaysBeforeDue. "off" (null) and "custom" (any other
// non-negative integer) are handled separately by the select itself.
export const REMINDER_PRESETS: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'task.reminder.onDueDate' },
  { value: 1, labelKey: 'task.reminder.oneDayBefore' },
  { value: 2, labelKey: 'task.reminder.twoDaysBefore' },
  { value: 7, labelKey: 'task.reminder.oneWeekBefore' },
];
