import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '../db';
import type { NewTaskComment, TaskCommentAuthorKind } from '../schema';
import { agent, task, taskComment, user } from '../schema';

export type { TaskComment, TaskCommentAuthorKind } from '../schema';

/** A comment with its author's current profile. The author fields are null once the author is gone. */
export interface TaskCommentWithAuthor {
  id: string;
  workspaceId: string;
  taskId: string;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  authorKind: TaskCommentAuthorKind;
  authorUserId: string | null;
  authorUserName: string | null;
  authorAgentId: string | null;
  authorAgentName: string | null;
  authorAgentIcon: string | null;
  authorAgentTone: string | null;
}

export type CreateTaskCommentResult =
  | { status: 'created'; commentId: string }
  | { status: 'task-not-found' }
  | { status: 'limit-reached' };

const taskCommentWithAuthorColumns = {
  id: taskComment.id,
  workspaceId: taskComment.workspaceId,
  taskId: taskComment.taskId,
  body: taskComment.body,
  editedAt: taskComment.editedAt,
  createdAt: taskComment.createdAt,
  authorKind: taskComment.authorKind,
  authorUserId: user.id,
  authorUserName: user.name,
  authorAgentId: agent.id,
  authorAgentName: agent.name,
  authorAgentIcon: agent.icon,
  authorAgentTone: agent.tone,
};

function selectTaskCommentsWithAuthor() {
  return db
    .select(taskCommentWithAuthorColumns)
    .from(taskComment)
    .leftJoin(user, eq(user.id, taskComment.authorUserId))
    .leftJoin(
      agent,
      and(eq(agent.id, taskComment.authorAgentId), eq(agent.workspaceId, taskComment.workspaceId)),
    );
}

/** Every comment of the task, oldest first, authors joined in the same query. */
export async function listTaskCommentsByTaskId({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}): Promise<TaskCommentWithAuthor[]> {
  return selectTaskCommentsWithAuthor()
    .where(and(eq(taskComment.workspaceId, workspaceId), eq(taskComment.taskId, taskId)))
    .orderBy(asc(taskComment.createdAt), asc(taskComment.id));
}

interface TaskCommentTarget {
  workspaceId: string;
  taskId: string;
  commentId: string;
}

function matchesTaskComment({ workspaceId, taskId, commentId }: TaskCommentTarget) {
  return and(
    eq(taskComment.id, commentId),
    eq(taskComment.workspaceId, workspaceId),
    eq(taskComment.taskId, taskId),
  );
}

export async function getTaskCommentById({
  workspaceId,
  taskId,
  commentId,
}: TaskCommentTarget): Promise<TaskCommentWithAuthor | undefined> {
  const [row] = await selectTaskCommentsWithAuthor().where(
    matchesTaskComment({ workspaceId, taskId, commentId }),
  );
  return row;
}

/**
 * Inserts a user comment unless the task already holds `maxComments`. The task row is locked first,
 * so parallel posts on one task are counted one after the other.
 */
export async function createUserTaskComment({
  workspaceId,
  taskId,
  userId,
  body,
  maxComments,
}: {
  workspaceId: string;
  taskId: string;
  userId: string;
  body: string;
  maxComments: number;
}): Promise<CreateTaskCommentResult> {
  return db.transaction(async (tx) => {
    const [lockedTask] = await tx
      .select({ id: task.id })
      .from(task)
      .where(and(eq(task.id, taskId), eq(task.workspaceId, workspaceId)))
      .for('update');
    if (!lockedTask) return { status: 'task-not-found' };

    const [existing] = await tx
      .select({ total: count() })
      .from(taskComment)
      .where(and(eq(taskComment.workspaceId, workspaceId), eq(taskComment.taskId, taskId)));
    if ((existing?.total ?? 0) >= maxComments) return { status: 'limit-reached' };

    const values: NewTaskComment = {
      workspaceId,
      taskId,
      authorKind: 'user',
      authorUserId: userId,
      body,
    };
    const [created] = await tx.insert(taskComment).values(values).returning({ id: taskComment.id });
    if (!created) throw new Error('Failed to insert task comment');
    return { status: 'created', commentId: created.id };
  });
}

export async function updateTaskCommentBody({
  body,
  ...target
}: TaskCommentTarget & { body: string }): Promise<void> {
  await db
    .update(taskComment)
    .set({ body, editedAt: new Date() })
    .where(matchesTaskComment(target));
}

export async function deleteTaskCommentById(target: TaskCommentTarget): Promise<void> {
  await db.delete(taskComment).where(matchesTaskComment(target));
}
