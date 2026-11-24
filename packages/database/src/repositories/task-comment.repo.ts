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
  taskRunId: string | null;
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

export const MAX_COMMENTS_PER_TASK = 100;
export const MAX_TASK_COMMENT_BODY_LENGTH = 10_000;

export type CreateTaskCommentResult =
  | { status: 'created'; commentId: string }
  | { status: 'task-not-found' }
  | { status: 'limit-reached' }
  | { status: 'run-note-limit-reached' };

const taskCommentWithAuthorColumns = {
  id: taskComment.id,
  workspaceId: taskComment.workspaceId,
  taskId: taskComment.taskId,
  taskRunId: taskComment.taskRunId,
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

/** Who wrote a comment: a user, or an agent. */
export type TaskCommentAuthor =
  | { kind: 'user'; userId: string }
  | { kind: 'agent'; agentId: string };

export interface CreateTaskCommentInput {
  workspaceId: string;
  taskId: string;
  author: TaskCommentAuthor;
  body: string;
  /** The agent run that wrote the comment, if any. */
  taskRunId?: string;
  /** Refuses the comment once the run has written this many. Unset means no cap. */
  maxCommentsOfRun?: number;
  /** For the run's own result and failure comments: they are never refused by the per-task cap. */
  skipTaskCommentCap?: boolean;
}

function toNewTaskComment({
  workspaceId,
  taskId,
  author,
  body,
  taskRunId,
}: CreateTaskCommentInput): NewTaskComment {
  if (author.kind === 'agent') {
    return {
      workspaceId,
      taskId,
      body,
      taskRunId,
      authorKind: 'agent',
      authorAgentId: author.agentId,
    };
  }
  return { workspaceId, taskId, body, taskRunId, authorKind: 'user', authorUserId: author.userId };
}

/**
 * Inserts a comment unless the task already holds `MAX_COMMENTS_PER_TASK`. The task row is locked
 * first, so parallel posts on one task are counted one after the other.
 */
export async function createTaskComment({
  workspaceId,
  taskId,
  author,
  body,
  taskRunId,
  maxCommentsOfRun,
  skipTaskCommentCap,
}: CreateTaskCommentInput): Promise<CreateTaskCommentResult> {
  return db.transaction(async (tx) => {
    const [lockedTask] = await tx
      .select({ id: task.id })
      .from(task)
      .where(and(eq(task.id, taskId), eq(task.workspaceId, workspaceId)))
      .for('update');
    if (!lockedTask) return { status: 'task-not-found' };

    if (!skipTaskCommentCap) {
      const [existing] = await tx
        .select({ total: count() })
        .from(taskComment)
        .where(and(eq(taskComment.workspaceId, workspaceId), eq(taskComment.taskId, taskId)));
      if ((existing?.total ?? 0) >= MAX_COMMENTS_PER_TASK) return { status: 'limit-reached' };
    }

    if (taskRunId && maxCommentsOfRun !== undefined) {
      const [ofRun] = await tx
        .select({ total: count() })
        .from(taskComment)
        .where(and(eq(taskComment.workspaceId, workspaceId), eq(taskComment.taskRunId, taskRunId)));
      if ((ofRun?.total ?? 0) >= maxCommentsOfRun) return { status: 'run-note-limit-reached' };
    }

    const values = toNewTaskComment({ workspaceId, taskId, author, body, taskRunId });
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
