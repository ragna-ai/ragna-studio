import { and, asc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import { db } from '../db';
import type {
  NewTask,
  NewTaskAttachment,
  Task,
  TaskAttachment,
  TaskAttachmentWithMedia,
  TaskLabel,
  TaskPriority,
  TaskStatus,
} from '../schema';
import { task, taskAttachment, taskToTaskLabel, workspace } from '../schema';
import { byteOrderAsc, byteOrderDesc } from '../utils/sort-order';

export type {
  NewTask,
  NewTaskAttachment,
  Task,
  TaskAttachment,
  TaskAttachmentWithMedia,
  TaskPriority,
  TaskStatus,
} from '../schema';

type TaskTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TaskWithBoardInfo = Task & {
  labels: TaskLabel[];
  assignedAgent: { id: string; name: string } | null;
  // Board progress badge ("2/5"): subtaskDoneCount / subtaskCount.
  subtaskCount: number;
  subtaskDoneCount: number;
};

export type TaskWithDetails = Task & {
  labels: TaskLabel[];
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
      status,
      priority,
      ...(taskIdsWithLabel ? { id: { in: taskIdsWithLabel } } : {}),
    },
    with: {
      labels: true,
      assignedAgent: assignedAgentColumns,
    },
    orderBy: (t) => byteOrderAsc(t.sortOrder),
  });

  const subtaskCounts = await getSubtaskCounts({ parentTaskIds: tasks.map((t) => t.id) });

  return tasks.map((taskRecord) => {
    const counts = subtaskCounts.get(taskRecord.id);
    return {
      ...taskRecord,
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
    },
  });

  return found ?? null;
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
        .values(labelIds.map((taskLabelId) => ({ taskId: createdTask.id, taskLabelId })));
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

// Appends to the bottom of the target status column: one key past the
// column's current last row.
async function sortOrderAtBottomOfColumn(
  tx: TaskTransaction,
  { workspaceId, status }: { workspaceId: string; status: TaskStatus },
): Promise<string> {
  const [lastTask] = await tx
    .select({ sortOrder: task.sortOrder })
    .from(task)
    .where(and(eq(task.workspaceId, workspaceId), eq(task.status, status)))
    .orderBy(byteOrderDesc(task.sortOrder))
    .limit(1);

  return generateKeyBetween(lastTask?.sortOrder ?? null, null);
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

/**
 * Partial update, shared by the API's PATCH endpoint and the agent's
 * updateTask tool. `status`/`sortOrder` are intentionally excluded, moving a
 * task is `moveTask` below. If `labelIds` is given, the task's label set is
 * replaced (delete + insert) in the same transaction.
 */
export async function updateTask({
  id,
  workspaceId,
  labelIds,
  ...fields
}: {
  id: string;
  workspaceId: string;
  labelIds?: string[];
} & UpdateTaskFields): Promise<Task | null> {
  return db.transaction(async (tx) => {
    const updateValues = { ...fields, ...reminderRearmFields(fields) };
    const hasScalarChanges = Object.keys(updateValues).length > 0;

    // A theoretically empty PATCH (no scalar fields, no labelIds): nothing
    // to write, so skip straight to returning the task as-is rather than
    // running an update at all.
    if (!hasScalarChanges && labelIds === undefined) {
      const currentTask = await tx.query.task.findFirst({ where: { id, workspaceId } });
      return currentTask ?? null;
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
      return null;
    }

    if (labelIds !== undefined) {
      await replaceTaskLabels(tx, { taskId: id, labelIds });
    }

    return updatedTask;
  });
}

async function replaceTaskLabels(
  tx: TaskTransaction,
  { taskId, labelIds }: { taskId: string; labelIds: string[] },
): Promise<void> {
  await tx.delete(taskToTaskLabel).where(eq(taskToTaskLabel.taskId, taskId));

  if (labelIds.length > 0) {
    await tx
      .insert(taskToTaskLabel)
      .values(labelIds.map((taskLabelId) => ({ taskId, taskLabelId })));
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
 * (omitted = top of column), then writes status + sortOrder in one call.
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
}): Promise<Task | null> {
  return db.transaction(async (tx) => {
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

    return movedTask ?? null;
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
 * resolve the owner, the notification recipient in v1.
 */
export async function listTasksDueForReminder(): Promise<TaskDueForReminder[]> {
  return db
    .select({
      taskId: task.id,
      workspaceId: task.workspaceId,
      taskNumber: task.number,
      taskTitle: task.title,
      ownerUserId: workspace.ownerId,
    })
    .from(task)
    .innerJoin(workspace, eq(task.workspaceId, workspace.id))
    .where(
      and(
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
}): Promise<TaskAttachmentWithMedia[]> {
  return db.query.taskAttachment.findMany({
    where: { taskId },
    with: { media: true },
    orderBy: (t, { asc: ascOrder }) => ascOrder(t.createdAt),
  });
}

export async function getTaskAttachmentById({ id }: { id: string }): Promise<TaskAttachmentWithMedia | null> {
  const found = await db.query.taskAttachment.findFirst({
    where: { id },
    with: { media: true },
  });

  return found ?? null;
}
