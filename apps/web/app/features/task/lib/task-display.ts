import {
  MinusIcon,
  SignalHighIcon,
  SignalLowIcon,
  SignalMediumIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from '@lucide/vue';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '~/features/task/types';

/** `TSK-<number>` display id (specs/tasks/prd.md, "Schema"). */
export function formatTaskDisplayId(taskNumber: number): string {
  return `TSK-${taskNumber}`;
}

export const STATUS_COLUMNS: { value: TaskStatus; labelKey: string }[] = [
  { value: 'backlog', labelKey: 'task.status.backlog' },
  { value: 'todo', labelKey: 'task.status.todo' },
  { value: 'in_progress', labelKey: 'task.status.in_progress' },
  { value: 'in_review', labelKey: 'task.status.in_review' },
  { value: 'done', labelKey: 'task.status.done' },
  { value: 'canceled', labelKey: 'task.status.canceled' },
];

export const PRIORITY_OPTIONS: {
  value: TaskPriority;
  labelKey: string;
  icon: LucideIcon;
}[] = [
  { value: 'none', labelKey: 'task.priority.none', icon: MinusIcon },
  { value: 'low', labelKey: 'task.priority.low', icon: SignalLowIcon },
  { value: 'medium', labelKey: 'task.priority.medium', icon: SignalMediumIcon },
  { value: 'high', labelKey: 'task.priority.high', icon: SignalHighIcon },
  { value: 'urgent', labelKey: 'task.priority.urgent', icon: TriangleAlertIcon },
];

export function priorityIcon(priority: TaskPriority): LucideIcon {
  return (
    PRIORITY_OPTIONS.find((option) => option.value === priority)?.icon ?? MinusIcon
  );
}

export function priorityLabelKey(priority: TaskPriority): string {
  return (
    PRIORITY_OPTIONS.find((option) => option.value === priority)?.labelKey ??
    'task.priority.none'
  );
}

export function statusLabelKey(status: TaskStatus): string {
  return (
    STATUS_COLUMNS.find((column) => column.value === status)?.labelKey ??
    'task.status.todo'
  );
}

// shadcn's Select emits its generic `AcceptableValue` (string | Record<string,
// unknown> | null), not `TaskStatus`/`TaskPriority`, so every select bound to
// one of these fields needs to narrow the emitted value before handing it to
// a typed setter. These guards are the single place that narrowing happens,
// instead of a bare `as TaskStatus`/`as TaskPriority` cast at each call site.
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && (TASK_PRIORITIES as readonly string[]).includes(value);
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
