import { and, eq } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import type { db } from '../db';
import type { TaskStatus } from '../schema';
import { task } from '../schema';
import { byteOrderDesc } from '../utils/sort-order';

export type TaskTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Appends to the bottom of the target status column: one key past the column's current last row. */
export async function sortOrderAtBottomOfColumn(
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

/**
 * Puts the task at the bottom of `status`, only while it is still in `onlyFromStatus` when given.
 * Used by agent runs, which must not override a status the user chose.
 */
export async function moveTaskToBottomOfColumn(
  tx: TaskTransaction,
  {
    workspaceId,
    taskId,
    status,
    onlyFromStatus,
  }: { workspaceId: string; taskId: string; status: TaskStatus; onlyFromStatus?: TaskStatus },
): Promise<void> {
  const sortOrder = await sortOrderAtBottomOfColumn(tx, { workspaceId, status });
  await tx
    .update(task)
    .set({ status, sortOrder })
    .where(
      and(
        eq(task.id, taskId),
        eq(task.workspaceId, workspaceId),
        onlyFromStatus ? eq(task.status, onlyFromStatus) : undefined,
      ),
    );
}
