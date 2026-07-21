import {
  type AnyPgColumn,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agent } from './agent.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'canceled';
export type TaskPriority = 'none' | 'urgent' | 'high' | 'medium' | 'low';

// TASK
// Linear-style kanban card (docs/tasks/prd.md). One board per workspace: the
// workspace *is* the board, so there is no separate board/column table.
// Authorship: exactly one of createdByUserId / createdByAgentId is set, same
// invariant as document.schema.ts. Both are set null on delete, not cascade:
// a task is workspace-owned, so removing its creator must not take the task
// with it.
// Subtasks are one level deep (enforced in the service, not the schema):
// deleting a parent sets `parentTaskId` to null on its subtasks instead of
// deleting them, so they survive as top-level tasks.
export const task = pgTable(
  'tasks',
  {
    id: primaryIdColumn,
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    // Per-workspace sequence, displayed as `TSK-<number>`. Computed in the
    // repo as max(number) + 1 for the workspace, inside a transaction.
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().$type<TaskStatus>().default('todo'),
    priority: text('priority').notNull().$type<TaskPriority>().default('none'),
    // Fractional-index rank within the status column (docs/tasks/prd.md,
    // "Ordering: fractional indexing"). Recomputed server-side on every move.
    sortOrder: text('sort_order').notNull(),
    dueDate: timestamp('due_date'),
    // Offset in days before dueDate the reminder fires, 0 = on the due date.
    // Meaningless without dueDate.
    remindDaysBeforeDue: integer('remind_days_before_due'),
    // Stamped by the reminder cron so a reminder fires exactly once. Cleared
    // whenever dueDate or remindDaysBeforeDue changes so the reminder re-arms.
    reminderSentAt: timestamp('reminder_sent_at'),
    // Nullable self-FK, set null on delete: a subtask survives its parent's
    // deletion as a top-level task. The AnyPgColumn return-type annotation
    // breaks the circular type reference (`task` referring to itself).
    parentTaskId: text('parent_task_id').references((): AnyPgColumn => task.id, {
      onDelete: 'set null',
    }),
    assignedAgentId: text('assigned_agent_id').references(() => agent.id, {
      onDelete: 'set null',
    }),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdByAgentId: text('created_by_agent_id').references(() => agent.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('task_workspaceId_idx').on(table.workspaceId),
    uniqueIndex('task_workspaceId_number_idx').on(table.workspaceId, table.number),
  ],
);

export type Task = typeof task.$inferSelect;
export type NewTask = typeof task.$inferInsert;

// TASK LABEL
// Workspace-scoped, colored labels attachable to tasks (many-to-many via
// taskToTaskLabel below). Managed by humans; agents may only attach existing
// ones (docs/tasks/prd.md).
export const taskLabel = pgTable(
  'task_labels',
  {
    id: primaryIdColumn,
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    ...timestamps,
  },
  (table) => [
    index('taskLabel_workspaceId_idx').on(table.workspaceId),
    uniqueIndex('taskLabel_workspaceId_name_idx').on(table.workspaceId, table.name),
  ],
);

export type TaskLabel = typeof taskLabel.$inferSelect;
export type NewTaskLabel = typeof taskLabel.$inferInsert;

// TASK <-> TASK LABEL
// Pure join table: deleting a label cascades its join rows only, it never
// touches tasks (docs/tasks/prd.md, "Labels").
export const taskToTaskLabel = pgTable(
  'tasks_to_task_labels',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    taskLabelId: text('task_label_id')
      .notNull()
      .references(() => taskLabel.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.taskLabelId] })],
);

export type TaskToTaskLabel = typeof taskToTaskLabel.$inferSelect;
export type NewTaskToTaskLabel = typeof taskToTaskLabel.$inferInsert;
