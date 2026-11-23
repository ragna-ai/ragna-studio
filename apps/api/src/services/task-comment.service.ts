import type { TaskCommentWithAuthor, WorkspaceRole } from '@repo/database';
import {
  createUserTaskComment,
  deleteTaskCommentById,
  getTaskById,
  getTaskCommentById,
  listTaskCommentsByTaskId,
  updateTaskCommentBody,
  WORKSPACE_MANAGER_ROLE,
} from '@repo/database';
import {
  ForbiddenException,
  NotFoundException,
  TaskCommentLimitReachedException,
  TaskCommentNotEditableException,
} from '../exceptions';

export const MAX_COMMENTS_PER_TASK = 100;

interface TaskCommentScope {
  workspaceId: string;
  taskId: string;
}

interface TaskCommentViewer {
  userId: string;
  workspaceRole: WorkspaceRole;
}

interface TaskCommentUserAuthor {
  kind: 'user';
  id: string | null;
  name: string | null;
}

interface TaskCommentAgentAuthor {
  kind: 'agent';
  id: string | null;
  name: string | null;
  icon: string | null;
  tone: string | null;
}

export interface TaskCommentResponse {
  id: string;
  taskId: string;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  author: TaskCommentUserAuthor | TaskCommentAgentAuthor;
  canEdit: boolean;
  canDelete: boolean;
}

function isOwnUserComment(comment: TaskCommentWithAuthor, viewer: TaskCommentViewer): boolean {
  return comment.authorKind === 'user' && comment.authorUserId === viewer.userId;
}

function canEditComment(comment: TaskCommentWithAuthor, viewer: TaskCommentViewer): boolean {
  return isOwnUserComment(comment, viewer);
}

function canDeleteComment(comment: TaskCommentWithAuthor, viewer: TaskCommentViewer): boolean {
  return isOwnUserComment(comment, viewer) || viewer.workspaceRole === WORKSPACE_MANAGER_ROLE;
}

function toCommentAuthor(comment: TaskCommentWithAuthor) {
  if (comment.authorKind === 'agent') {
    return {
      kind: 'agent',
      id: comment.authorAgentId,
      name: comment.authorAgentName,
      icon: comment.authorAgentIcon,
      tone: comment.authorAgentTone,
    } satisfies TaskCommentAgentAuthor;
  }
  return {
    kind: 'user',
    id: comment.authorUserId,
    name: comment.authorUserName,
  } satisfies TaskCommentUserAuthor;
}

function toCommentResponse(
  comment: TaskCommentWithAuthor,
  viewer: TaskCommentViewer,
): TaskCommentResponse {
  return {
    id: comment.id,
    taskId: comment.taskId,
    body: comment.body,
    editedAt: comment.editedAt,
    createdAt: comment.createdAt,
    author: toCommentAuthor(comment),
    canEdit: canEditComment(comment, viewer),
    canDelete: canDeleteComment(comment, viewer),
  };
}

async function assertTaskExists({ workspaceId, taskId }: TaskCommentScope): Promise<void> {
  const taskRecord = await getTaskById({ id: taskId, workspaceId });
  if (!taskRecord) throw new NotFoundException('Task not found');
}

async function getCommentOrThrow({
  workspaceId,
  taskId,
  commentId,
}: TaskCommentScope & { commentId: string }): Promise<TaskCommentWithAuthor> {
  const comment = await getTaskCommentById({ workspaceId, taskId, commentId });
  if (!comment) throw new NotFoundException('Comment not found');
  return comment;
}

export async function listTaskComments({
  viewer,
  ...scope
}: TaskCommentScope & { viewer: TaskCommentViewer }): Promise<TaskCommentResponse[]> {
  await assertTaskExists(scope);
  const comments = await listTaskCommentsByTaskId(scope);
  return comments.map((comment) => toCommentResponse(comment, viewer));
}

export async function createTaskComment({
  viewer,
  body,
  ...scope
}: TaskCommentScope & { viewer: TaskCommentViewer; body: string }): Promise<TaskCommentResponse> {
  const result = await createUserTaskComment({
    ...scope,
    userId: viewer.userId,
    body,
    maxComments: MAX_COMMENTS_PER_TASK,
  });
  if (result.status === 'task-not-found') throw new NotFoundException('Task not found');
  if (result.status === 'limit-reached') throw new TaskCommentLimitReachedException();

  const created = await getCommentOrThrow({ ...scope, commentId: result.commentId });
  return toCommentResponse(created, viewer);
}

export async function editTaskComment({
  viewer,
  commentId,
  body,
  ...scope
}: TaskCommentScope & {
  viewer: TaskCommentViewer;
  commentId: string;
  body: string;
}): Promise<TaskCommentResponse> {
  const comment = await getCommentOrThrow({ ...scope, commentId });
  if (comment.authorKind === 'agent') throw new TaskCommentNotEditableException();
  if (!canEditComment(comment, viewer)) throw new ForbiddenException();

  await updateTaskCommentBody({ ...scope, commentId, body });

  const updated = await getCommentOrThrow({ ...scope, commentId });
  return toCommentResponse(updated, viewer);
}

export async function removeTaskComment({
  viewer,
  commentId,
  ...scope
}: TaskCommentScope & { viewer: TaskCommentViewer; commentId: string }): Promise<void> {
  const comment = await getCommentOrThrow({ ...scope, commentId });
  if (!canDeleteComment(comment, viewer)) throw new ForbiddenException();

  await deleteTaskCommentById({ ...scope, commentId });
}
