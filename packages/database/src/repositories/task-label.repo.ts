import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { TaskLabel } from '../schema';
import { taskLabel } from '../schema';

export type { TaskLabel, NewTaskLabel } from '../schema';

export async function listTaskLabels({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<TaskLabel[]> {
  return db.query.taskLabel.findMany({
    where: { workspaceId },
    orderBy: (t, { asc }) => asc(t.name),
  });
}

export async function createTaskLabel({
  workspaceId,
  name,
  color,
}: {
  workspaceId: string;
  name: string;
  color: string;
}): Promise<TaskLabel> {
  const [createdTaskLabel] = await db
    .insert(taskLabel)
    .values({ workspaceId, name, color })
    .returning();

  if (!createdTaskLabel) {
    throw new Error('Failed to create task label');
  }

  return createdTaskLabel;
}

export async function updateTaskLabel({
  id,
  workspaceId,
  name,
  color,
}: {
  id: string;
  workspaceId: string;
  name?: string;
  color?: string;
}): Promise<TaskLabel | null> {
  const [updatedTaskLabel] = await db
    .update(taskLabel)
    .set({ name, color })
    .where(and(eq(taskLabel.id, id), eq(taskLabel.workspaceId, workspaceId)))
    .returning();

  return updatedTaskLabel ?? null;
}

// Cascades the join rows in tasks_to_task_labels only (FK onDelete:
// 'cascade'), never touches the tasks themselves.
export async function deleteTaskLabel({
  id,
  workspaceId,
}: {
  id: string;
  workspaceId: string;
}): Promise<void> {
  await db.delete(taskLabel).where(and(eq(taskLabel.id, id), eq(taskLabel.workspaceId, workspaceId)));
}
