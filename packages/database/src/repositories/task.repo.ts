import { and, asc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { EmptyFilter } from 'drizzle-orm/relations';
import { generateKeyBetween } from 'fractional-indexing';
import { db } from '../db';
import type {
  NewTask,
  NewTaskAttachment,
  Task,
  TaskAttachment,
  TaskAttachmentWithMedia,
  TaskAttachmentWithMediaSummary,
  TaskLabel,
  TaskPriority,
  TaskRunStatus,
  TaskStatus,
} from '../schema';
import {
  organizationMember,
  organization,
  task,
  taskAttachment,
  taskRunActiveStatuses,
  taskToTaskLabel,
  workspace,
} from '../schema';
import { ORGANIZATION_OWNER_ROLE, organizationRoleMatches } from './organization.repo';
import { byteOrderAsc } from '../utils/sort-order';
import { sortOrderAtBottomOfColumn, type TaskTransaction } from './task-column';
import { cancelActiveTaskRunOfTask, findActiveTaskRunId } from './task-run.repo';

export type {
  NewTask,
  NewTaskAttachment,
  Task,
  TaskAttachment,
  TaskAttachmentWithMedia,
  TaskAttachmentWithMediaSummary,
  TaskPriority,
  TaskStatus,
} from '../schema';

/** The agent run in progress on a task, as the board shows it. */
export interface ActiveTaskRunSummary {
  id: string;
  status: TaskRunStatus;
}

export type TaskWithBoardInfo = Task & {
  labels: TaskLabel[];
  activeRun: ActiveTaskRunSummary | null;
  assignedAgent: { id: string; name: string } | null;
  // Board progress badge ("2/5"): subtaskDoneCount / subtaskCount.
  subtaskCount: number;
  subtaskDoneCount: number;
};

export type TaskWithDetails = Task & {
  labels: TaskLabel[];
  activeRun: ActiveTaskRunSummary | null;
  assignedAgent: { id: string; name: string } | null;
  subtasks: Task[];
};

const assignedAgentColumns = { columns: { id: true, name: true } } as const;

/**
 * Board/list query: every task in the workspace with its labels, assigned
 * agent, and subtask count, ordered by `sortOrder`.
 * Not paginated on purpose, a board needs every card.
 */
export async function listTasks({
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
  const taskIdsWithLabel = taskLabelId ? await getTaskIdsForLabel({ taskLabelId }) : null;

  const tasks = await db.query.task.findMany({
    where: {
      workspaceId,
      status: status ?? EmptyFilter,
      priority: priority ?? EmptyFilter,
      ...(taskIdsWithLabel ? { id: { in: taskIdsWithLabel } } : {}),
    },
    with: {
      labels: true,
      assignedAgent: assignedAgentColumns,
      runs: {
        columns: { id: true, status: true },
        where: { status: { in: [...taskRunActiveStatuses] } },
        limit: 1,
      },
    },
    orderBy: (t) => byteOrderAsc(t.sortOrder),
  });

  const subtaskCounts = await getSubtaskCounts({ parentTaskIds: tasks.map((t) => t.id) });

  return tasks.map(({ runs, ...taskRecord }) => {
    const counts = subtaskCounts.get(taskRecord.id);
    return {
      ...taskRecord,
      activeRun: runs[0] ?? null,
      subtaskCount: counts?.total ?? 0,
      subtaskDoneCount: counts?.done ?? 0,
    };
  });
}

async function getTaskIdsForLabel({ taskLabelId }: { taskLabelId: string }): Promise<string[]> {
  const rows = await db
    .select({ taskId: taskToTaskLabel.taskId })
    .from(taskToTaskLabel)
    .where(eq(taskToTaskLabel.taskLabelId, taskLabelId));

  return rows.map((row) => row.taskId);
}

type SubtaskCounts = { total: number; done: number };

/**
 * One grouped query (total count plus a `done`-filtered count) instead of
 * N+1, used by `listTasks` above to render the board's "2/5" subtask badge.
 */
async function getSubtaskCounts({
  parentTaskIds,
}: {
  parentTaskIds: string[];
}): Promise<Map<string, SubtaskCounts>> {
  if (parentTaskIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      parentTaskId: task.parentTaskId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${task.status} = ${'done'})::int`,
    })
    .from(task)
    .where(inArray(task.parentTaskId, parentTaskIds))
    .groupBy(task.parentTaskId);

  return new Map(
    rows
      .filter(
        (row): row is { parentTaskId: string; total: number; done: number } =>
          row.parentTaskId !== null,
      )
      .map((row) => [row.parentTaskId, { total: row.total, done: row.done }]),
  );
}

export async function getTaskById({
  id,
  workspaceId,
}: {
  id: string;
  workspaceId: string;
}): Promise<TaskWithDetails | null> {
  const found = await db.query.task.findFirst({
    where: { id, workspaceId },
    with: {
      labels: true,
      assignedAgent: assignedAgentColumns,
      subtasks: { orderBy: (t) => byteOrderAsc(t.sortOrder) },
      runs: {
        columns: { id: true, status: true },
        where: { status: { in: [...taskRunActiveStatuses] } },
        limit: 1,
      },
    },
  });
  if (!found) return null;

  const { runs, ...taskRecord } = found;
  return { ...taskRecord, activeRun: runs[0] ?? null };
}

export async function createTask({
  workspaceId,
  title,
  description,
  status = 'todo',
  priority,
  dueDate,
  remindDaysBeforeDue,
  parentTaskId,
  assignedAgentId,
  createdByUserId,
  createdByAgentId,
  labelIds,
}: {
  workspaceId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  remindDaysBeforeDue?: number | null;
  parentTaskId?: string | null;
  assignedAgentId?: string | null;
  createdByUserId?: string | null;
  createdByAgentId?: string | null;
  labelIds?: string[];
}): Promise<Task> {
  return db.transaction(async (tx) => {
    const number = await nextTaskNumber(tx, { workspaceId });
    const sortOrder = await sortOrderAtBottomOfColumn(tx, { workspaceId, status });

    const [createdTask] = await tx
      .insert(task)
      .values({
        workspaceId,
        number,
        title,
        description,
        status,
        priority,
        sortOrder,
        dueDate,
        remindDaysBeforeDue,
        parentTaskId,
        assignedAgentId,
        createdByUserId,
        createdByAgentId,
      })
      .returning();

    if (!createdTask) {
      throw new Error('Failed to create task');
    }

    if (labelIds && labelIds.length > 0) {
      await tx
        .insert(taskToTaskLabel)
        .values(
          labelIds.map((taskLabelId) => ({ workspaceId, taskId: createdTask.id, taskLabelId })),
        );
    }

    return createdTask;
  });
}

async function nextTaskNumber(
  tx: TaskTransaction,
  { workspaceId }: { workspaceId: string },
): Promise<number> {
  const [row] = await tx
    .select({ maxNumber: sql<number | null>`max(${task.number})` })
    .from(task)
    .where(eq(task.workspaceId, workspaceId));

  return (row?.maxNumber ?? 0) + 1;
}

type UpdateTaskFields = Partial<
  Pick<
    NewTask,
    | 'title'
    | 'description'
    | 'priority'
    | 'dueDate'
    | 'remindDaysBeforeDue'
    | 'parentTaskId'
    | 'assignedAgentId'
  >
>;

/** Why a task write came back with no task: it is missing, or an agent run holds it. */
export type TaskWriteResult =
  | { status: 'written'; task: Task }
  | { status: 'not-found' }
  | { status: 'run-active' };

/**
 * Locks the task row and answers whether a run may block the write. Returns the task's current
 * agent so the caller can tell a reassignment from a plain edit.
 */
async function lockTaskForWrite(
  tx: TaskTransaction,
  { id, workspaceId }: { id: string; workspaceId: string },
): Promise<{ assignedAgentId: string | null; activeRunId: string | null } | null> {
  const [locked] = await tx
    .select({ assignedAgentId: task.assignedAgentId })
    .from(task)
    .where(and(eq(task.id, id), eq(task.workspaceId, workspaceId)))
    .for('update');
  if (!locked) return null;

  const activeRunId = await findActiveTaskRunId(tx, { workspaceId, taskId: id });
  return { assignedAgentId: locked.assignedAgentId, activeRunId };
}

/**
 * Partial update, shared by the API's PATCH endpoint and the agent's
 * updateTask tool. `status`/`sortOrder` are intentionally excluded, moving a
 * task is `moveTask` below. If `labelIds` is given, the task's label set is
 * replaced (delete + insert) in the same transaction.
 *
 * A task with an active run is locked: the result is `run-active`. Giving the task another agent
 * is the exception for users, it cancels the run in the same transaction. Agent tools pass
 * `onReassignWithActiveRun: 'refuse'`.
 */
export async function updateTask({
  id,
  workspaceId,
  labelIds,
  onReassignWithActiveRun = 'cancel',
  ...fields
}: {
  id: string;
  workspaceId: string;
  labelIds?: string[];
  /** What a reassignment does to an active run: users stop it, agents are refused. */
  onReassignWithActiveRun?: 'cancel' | 'refuse';
} & UpdateTaskFields): Promise<TaskWriteResult> {
  return db.transaction(async (tx): Promise<TaskWriteResult> => {
    const locked = await lockTaskForWrite(tx, { id, workspaceId });
    if (!locked) return { status: 'not-found' };

    if (locked.activeRunId) {
      const isReassignment =
        fields.assignedAgentId !== undefined && fields.assignedAgentId !== locked.assignedAgentId;
      if (!isReassignment || onReassignWithActiveRun === 'refuse') {
        return { status: 'run-active' };
      }
      await cancelActiveTaskRunOfTask(tx, { workspaceId, taskId: id });
    }

    const updateValues = { ...fields, ...reminderRearmFields(fields) };
    const hasScalarChanges = Object.keys(updateValues).length > 0;

    // A theoretically empty PATCH (no scalar fields, no labelIds): nothing
    // to write, so skip straight to returning the task as-is rather than
    // running an update at all.
    if (!hasScalarChanges && labelIds === undefined) {
      const currentTask = await tx.query.task.findFirst({ where: { id, workspaceId } });
      return currentTask ? { status: 'written', task: currentTask } : { status: 'not-found' };
    }

    // A label-only PATCH has no scalar fields, and `set({})` throws ("No
    // values to set"), so bump `updatedAt` alone instead. Keeps list
    // sorting/staleness honest for a label-only change.
    const [updatedTask] = await tx
      .update(task)
      .set(hasScalarChanges ? updateValues : { updatedAt: new Date() })
      .where(and(eq(task.id, id), eq(task.workspaceId, workspaceId)))
      .returning();

    if (!updatedTask) {
      return { status: 'not-found' };
    }

    if (labelIds !== undefined) {
      await replaceTaskLabels(tx, { taskId: id, workspaceId, labelIds });
    }

    return { status: 'written', task: updatedTask };
  });
}

async function replaceTaskLabels(
  tx: TaskTransaction,
  { taskId, workspaceId, labelIds }: { taskId: string; workspaceId: string; labelIds: string[] },
): Promise<void> {
  await tx.delete(taskToTaskLabel).where(eq(taskToTaskLabel.taskId, taskId));

  if (labelIds.length > 0) {
    await tx
      .insert(taskToTaskLabel)
      .values(labelIds.map((taskLabelId) => ({ workspaceId, taskId, taskLabelId })));
  }
}

// Reminder re-arm rule, shared by the API's
// PATCH endpoint and the agent's updateTask tool since both call this
// function: touching dueDate or remindDaysBeforeDue clears reminderSentAt so
// a rescheduled reminder fires again. `'dueDate' in fields` (rather than
// `fields.dueDate !== undefined`) is what tells "the caller sent dueDate" apart
// from "the caller omitted it", since a caller may legitimately send `null`.
function reminderRearmFields(
  fields: Pick<UpdateTaskFields, 'dueDate' | 'remindDaysBeforeDue'>,
): Partial<Pick<NewTask, 'remindDaysBeforeDue' | 'reminderSentAt'>> {
  const touchesReminderInputs = 'dueDate' in fields || 'remindDaysBeforeDue' in fields;
  if (!touchesReminderInputs) {
    return {};
  }

  // Clearing the due date makes the offset meaningless, so clear it too.
  if ('dueDate' in fields && fields.dueDate === null) {
    return { remindDaysBeforeDue: null, reminderSentAt: null };
  }

  return { reminderSentAt: null };
}

/**
 * Server-side rank computation for a drag or an agent move:
 * loads the target
 * column's neighbors and slots the task in right after `afterTaskId`
 * (omitted = top of column), then writes status + sortOrder in one call. A task with an active
 * run is locked: the result is `run-active`.
 */
export async function moveTask({
  id,
  workspaceId,
  status,
  afterTaskId,
}: {
  id: string;
  workspaceId: string;
  status: TaskStatus;
  afterTaskId?: string | null;
}): Promise<TaskWriteResult> {
  return db.transaction(async (tx): Promise<TaskWriteResult> => {
    // Locks the workspace row for the duration of the transaction, the same
    // pattern `moveDatasetRow` uses on its parent dataset row, so concurrent
    // moves (and `createTask`'s append, see `sortOrderAtBottomOfColumn`) in
    // this workspace serialize instead of racing to compute colliding sort
    // keys.
    const [lockedWorkspace] = await tx
      .select()
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .for('update');

    if (!lockedWorkspace) {
      throw new Error('Workspace not found');
    }

    const locked = await lockTaskForWrite(tx, { id, workspaceId });
    if (!locked) return { status: 'not-found' };
    if (locked.activeRunId) return { status: 'run-active' };

    const columnTasks = await tx
      .select({ id: task.id, sortOrder: task.sortOrder })
      .from(task)
      .where(and(eq(task.workspaceId, workspaceId), eq(task.status, status), ne(task.id, id)))
      .orderBy(byteOrderAsc(task.sortOrder), asc(task.id));

    // Pre-existing tasks can share a `sortOrder` (same risk as
    // `moveDatasetRow` in dataset.repo.ts). `generateKeyBetween` throws on
    // equal bounds, so repair any duplicates in place before computing the
    // move.
    if (hasDuplicateSortOrder(columnTasks)) {
      let previousSortOrder: string | null = null;
      for (const columnTask of columnTasks) {
        const renumberedSortOrder = generateKeyBetween(previousSortOrder, null);
        if (renumberedSortOrder !== columnTask.sortOrder) {
          await tx
            .update(task)
            .set({ sortOrder: renumberedSortOrder })
            .where(eq(task.id, columnTask.id));
          columnTask.sortOrder = renumberedSortOrder;
        }
        previousSortOrder = columnTask.sortOrder;
      }
    }

    const sortOrder = resolveMoveSortOrder(columnTasks, afterTaskId);

    const [movedTask] = await tx
      .update(task)
      .set({ status, sortOrder })
      .where(and(eq(task.id, id), eq(task.workspaceId, workspaceId)))
      .returning();

    return movedTask ? { status: 'written', task: movedTask } : { status: 'not-found' };
  });
}

// `columnTasks` is sorted by `sortOrder` (with `id` as tiebreaker), so a
// duplicate only ever shows up as two adjacent equal values.
function hasDuplicateSortOrder(columnTasks: { sortOrder: string }[]): boolean {
  return columnTasks.some(
    (columnTask, index) => index > 0 && columnTask.sortOrder === columnTasks[index - 1]?.sortOrder,
  );
}

// `columnTasks` is already scoped to the target workspace + status, so
// finding `afterTaskId` in it is also the "belongs to the same
// workspace/status" validation the PRD asks for.
function resolveMoveSortOrder(
  columnTasks: { id: string; sortOrder: string }[],
  afterTaskId: string | null | undefined,
): string {
  if (!afterTaskId) {
    return generateKeyBetween(null, columnTasks[0]?.sortOrder ?? null);
  }

  const afterIndex = columnTasks.findIndex((columnTask) => columnTask.id === afterTaskId);
  if (afterIndex === -1) {
    throw new Error('afterTaskId does not belong to the target workspace/status column');
  }

  const afterTask = columnTasks[afterIndex];
  const nextTask = columnTasks[afterIndex + 1];
  return generateKeyBetween(afterTask?.sortOrder ?? null, nextTask?.sortOrder ?? null);
}

export async function deleteTask({
  id,
  workspaceId,
}: {
  id: string;
  workspaceId: string;
}): Promise<void> {
  await db.delete(task).where(and(eq(task.id, id), eq(task.workspaceId, workspaceId)));
}

export type TaskDueForReminder = {
  taskId: string;
  workspaceId: string;
  taskNumber: number;
  taskTitle: string;
  ownerUserId: string;
};

/**
 * For the reminder cron: tasks with a due
 * date and an offset, not yet reminded, not done/canceled, whose fire time
 * (`dueDate - remindDaysBeforeDue days`) has passed. Joins the workspace to
 * resolve the organization owners, the notification recipients.
 */
export async function listTasksDueForReminder(): Promise<TaskDueForReminder[]> {
  return db
    .select({
      taskId: task.id,
      workspaceId: task.workspaceId,
      taskNumber: task.number,
      taskTitle: task.title,
      ownerUserId: organizationMember.userId,
    })
    .from(task)
    .innerJoin(workspace, eq(task.workspaceId, workspace.id))
    .innerJoin(organization, eq(organization.id, workspace.organizationId))
    .innerJoin(
      organizationMember,
      and(
        eq(organizationMember.organizationId, workspace.organizationId),
        organizationRoleMatches(organizationMember.role, ORGANIZATION_OWNER_ROLE),
      ),
    )
    .where(
      and(
        isNull(organization.deletedAt),
        isNotNull(task.dueDate),
        isNotNull(task.remindDaysBeforeDue),
        isNull(task.reminderSentAt),
        notInArray(task.status, ['done', 'canceled']),
        sql`${task.dueDate} - make_interval(days => ${task.remindDaysBeforeDue}) <= now()`,
      ),
    );
}

export async function markTaskReminderSent({ id }: { id: string }): Promise<void> {
  await db.update(task).set({ reminderSentAt: new Date() }).where(eq(task.id, id));
}

// TASK ATTACHMENT

export async function createTaskAttachment(values: NewTaskAttachment): Promise<TaskAttachment> {
  const [created] = await db.insert(taskAttachment).values(values).returning();

  if (!created) {
    throw new Error('Failed to create task attachment');
  }

  return created;
}

export async function deleteTaskAttachmentById({ id }: { id: string }): Promise<void> {
  await db.delete(taskAttachment).where(eq(taskAttachment.id, id));
}

export async function getTaskAttachmentsByTaskId({
  taskId,
}: {
  taskId: string;
}): Promise<TaskAttachmentWithMediaSummary[]> {
  return db.query.taskAttachment.findMany({
    where: { taskId },
    with: { media: { columns: { extractedText: false } } },
    orderBy: (t, { asc: ascOrder }) => ascOrder(t.createdAt),
  });
}

export async function getTaskAttachmentById({
  id,
}: {
  id: string;
}): Promise<TaskAttachmentWithMedia | null> {
  const found = await db.query.taskAttachment.findFirst({
    where: { id },
    with: { media: true },
  });

  return found ?? null;
}
