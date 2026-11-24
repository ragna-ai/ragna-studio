import { db } from '@repo/database';
import { agent, taskComment } from '@repo/database/schema';
import {
  deleteSeededUser,
  seedAuthenticatedUser,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { expectProblem } from '../agent/agent-lock-fixtures';
import {
  seedOrganizationWithRoles,
  type OrganizationWithRoles,
  type SeededUser,
} from '../workspace/workspace-access-fixtures';

const userAuthorSchema = z.strictObject({
  kind: z.literal('user'),
  id: z.string().nullable(),
  name: z.string().nullable(),
});

const agentAuthorSchema = z.strictObject({
  kind: z.literal('agent'),
  id: z.string().nullable(),
  name: z.string().nullable(),
  icon: z.string().nullable(),
  tone: z.string().nullable(),
});

const commentSchema = z.strictObject({
  id: z.string(),
  taskId: z.string(),
  taskRunId: z.string().nullable(),
  body: z.string(),
  editedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  author: z.discriminatedUnion('kind', [userAuthorSchema, agentAuthorSchema]),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

const commentListSchema = z.strictObject({ comments: z.array(commentSchema) });
const commentResponseSchema = z.strictObject({ comment: commentSchema });
const taskResponseSchema = z.object({ task: z.object({ id: z.string() }) });

const MAX_COMMENTS = 100;

interface Fixture {
  org: OrganizationWithRoles;
  workspaceId: string;
  taskId: string;
}

function jsonHeaders(user: SeededUser) {
  return { cookie: user.cookieHeader, 'content-type': 'application/json' };
}

async function seedFixture(): Promise<Fixture> {
  const org = await seedOrganizationWithRoles();
  const workspaceId = org.owner.workspaceId;
  const response = await app.request(`/workspace/${workspaceId}/task`, {
    method: 'POST',
    headers: jsonHeaders(org.owner),
    body: JSON.stringify({ title: 'A task' }),
  });
  const { task } = taskResponseSchema.parse(await response.json());
  return { org, workspaceId, taskId: task.id };
}

function commentsPath({ workspaceId, taskId }: Fixture, commentId?: string) {
  const base = `/workspace/${workspaceId}/task/${taskId}/comments`;
  return commentId ? `${base}/${commentId}` : base;
}

function listComments(fixture: Fixture, user: SeededUser) {
  return app.request(commentsPath(fixture), { headers: { cookie: user.cookieHeader } });
}

function postComment(fixture: Fixture, user: SeededUser, body: unknown) {
  return app.request(commentsPath(fixture), {
    method: 'POST',
    headers: jsonHeaders(user),
    body: JSON.stringify({ body }),
  });
}

function patchComment(fixture: Fixture, user: SeededUser, commentId: string, body: unknown) {
  return app.request(commentsPath(fixture, commentId), {
    method: 'PATCH',
    headers: jsonHeaders(user),
    body: JSON.stringify({ body }),
  });
}

function deleteComment(fixture: Fixture, user: SeededUser, commentId: string) {
  return app.request(commentsPath(fixture, commentId), {
    method: 'DELETE',
    headers: { cookie: user.cookieHeader },
  });
}

async function postCommentOk(fixture: Fixture, user: SeededUser, body: string) {
  const response = await postComment(fixture, user, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  return commentResponseSchema.parse(await response.json()).comment;
}

async function fetchComments(fixture: Fixture, user: SeededUser) {
  const response = await listComments(fixture, user);
  expect(response.status).toBe(StatusCodes.OK);
  return commentListSchema.parse(await response.json()).comments;
}

async function insertAgentComment(fixture: Fixture, body: string) {
  const { aiModelId } = await seedTokenPricedAiModel();
  const [row] = await db
    .insert(agent)
    .values({
      userId: fixture.org.owner.userId,
      workspaceId: fixture.workspaceId,
      aiModelId,
      name: 'Helper',
      systemPrompt: 'x',
      icon: 'bot',
      tone: 'blue',
    })
    .returning({ id: agent.id });
  if (!row) throw new Error('agent not inserted');
  const [comment] = await db
    .insert(taskComment)
    .values({
      workspaceId: fixture.workspaceId,
      taskId: fixture.taskId,
      authorKind: 'agent',
      authorAgentId: row.id,
      body,
    })
    .returning({ id: taskComment.id });
  if (!comment) throw new Error('comment not inserted');
  return { agentId: row.id, commentId: comment.id };
}

async function insertUserComments(fixture: Fixture, count: number) {
  await db.insert(taskComment).values(
    Array.from({ length: count }, (_, index) => ({
      workspaceId: fixture.workspaceId,
      taskId: fixture.taskId,
      authorKind: 'user' as const,
      authorUserId: fixture.org.owner.userId,
      body: `Comment ${index}`,
    })),
  );
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('POST /workspace/:workspaceId/task/:taskId/comments', () => {
  test('stores the comment with its author and returns it', async () => {
    const fixture = await seedFixture();

    const comment = await postCommentOk(fixture, fixture.org.member, '**Hello**');

    expect(comment.taskId).toBe(fixture.taskId);
    expect(comment.body).toBe('**Hello**');
    expect(comment.editedAt).toBeNull();
    expect(comment.author).toMatchObject({ kind: 'user', id: fixture.org.member.userId });
    expect(comment.canEdit).toBe(true);
    expect(comment.canDelete).toBe(true);
  });

  test('appends the comment last in the list', async () => {
    const fixture = await seedFixture();
    await postCommentOk(fixture, fixture.org.owner, 'first');

    const comment = await postCommentOk(fixture, fixture.org.member, 'second');

    const comments = await fetchComments(fixture, fixture.org.owner);
    expect(comments.at(-1)?.id).toBe(comment.id);
  });

  test.each([
    ['an empty body', ''],
    ['a body over 10,000 characters', 'a'.repeat(10_001)],
    ['a missing body', undefined],
  ])('rejects %s with 422', async (_label, body) => {
    const fixture = await seedFixture();

    const response = await postComment(fixture, fixture.org.owner, body);

    await expectProblem(response, StatusCodes.UNPROCESSABLE_ENTITY, 'validation');
  });

  test('accepts a body of exactly 10,000 characters', async () => {
    const fixture = await seedFixture();

    const response = await postComment(fixture, fixture.org.owner, 'a'.repeat(10_000));

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test('rejects the 101st comment with task-comment-limit-reached', async () => {
    const fixture = await seedFixture();
    await insertUserComments(fixture, MAX_COMMENTS);

    const response = await postComment(fixture, fixture.org.owner, 'one too many');

    await expectProblem(response, StatusCodes.CONFLICT, 'task-comment-limit-reached');
    expect(await fetchComments(fixture, fixture.org.owner)).toHaveLength(MAX_COMMENTS);
  });

  test('lets exactly one of several parallel posts take the last free slot', async () => {
    const fixture = await seedFixture();
    await insertUserComments(fixture, MAX_COMMENTS - 1);

    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        postComment(fixture, fixture.org.owner, `parallel ${index}`),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === StatusCodes.CREATED)).toHaveLength(1);
    expect(statuses.filter((status) => status === StatusCodes.CONFLICT)).toHaveLength(11);
    expect(await fetchComments(fixture, fixture.org.owner)).toHaveLength(MAX_COMMENTS);
  });

  test('answers 404 for a task that does not exist', async () => {
    const fixture = await seedFixture();

    const response = await postComment(
      { ...fixture, taskId: Bun.randomUUIDv7() },
      fixture.org.owner,
      'x',
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('answers 404 to a user with no access to the workspace', async () => {
    const fixture = await seedFixture();
    const stranger = await seedAuthenticatedUser();

    const response = await postComment(fixture, stranger, 'hi');

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await fetchComments(fixture, fixture.org.owner)).toEqual([]);
  });
});

describe('GET /workspace/:workspaceId/task/:taskId/comments', () => {
  test('lists the comments oldest first with their markdown untouched', async () => {
    const fixture = await seedFixture();
    await postCommentOk(fixture, fixture.org.owner, '# one');
    await postCommentOk(fixture, fixture.org.member, '- two');
    await postCommentOk(fixture, fixture.org.owner, '`three`');

    const comments = await fetchComments(fixture, fixture.org.owner);

    expect(comments.map((comment) => comment.body)).toEqual(['# one', '- two', '`three`']);
  });

  test('is empty for a task without comments', async () => {
    const fixture = await seedFixture();

    expect(await fetchComments(fixture, fixture.org.owner)).toEqual([]);
  });

  test('shows the author name and the edit and delete rights of the viewer', async () => {
    const fixture = await seedFixture();
    await postCommentOk(fixture, fixture.org.member, 'by member');

    const [asEditor] = await fetchComments(fixture, fixture.org.otherMember);
    const [asAuthor] = await fetchComments(fixture, fixture.org.member);
    const [asManager] = await fetchComments(fixture, fixture.org.owner);

    expect(asEditor).toMatchObject({ canEdit: false, canDelete: false });
    expect(asAuthor).toMatchObject({ canEdit: true, canDelete: true });
    expect(asManager).toMatchObject({ canEdit: false, canDelete: true });
    expect(asEditor?.author).toMatchObject({
      kind: 'user',
      id: fixture.org.member.userId,
      name: expect.any(String),
    });
  });

  test('shows an agent comment with the agent name and mark, not editable by anyone', async () => {
    const fixture = await seedFixture();
    const { agentId } = await insertAgentComment(fixture, 'Run finished');

    const [comment] = await fetchComments(fixture, fixture.org.owner);

    expect(comment?.author).toEqual({
      kind: 'agent',
      id: agentId,
      name: 'Helper',
      icon: 'bot',
      tone: 'blue',
    });
    expect(comment).toMatchObject({ canEdit: false, canDelete: true });
  });

  test('keeps the text of a comment whose user author was deleted', async () => {
    const fixture = await seedFixture();
    await postCommentOk(fixture, fixture.org.member, 'still here');
    await deleteSeededUser({ userId: fixture.org.member.userId });

    const [comment] = await fetchComments(fixture, fixture.org.owner);

    expect(comment?.body).toBe('still here');
    expect(comment?.author).toEqual({ kind: 'user', id: null, name: null });
  });

  test('keeps the text of a comment whose agent author was deleted', async () => {
    const fixture = await seedFixture();
    const { agentId } = await insertAgentComment(fixture, 'agent text');

    const response = await app.request(`/workspace/${fixture.workspaceId}/agent/${agentId}`, {
      method: 'DELETE',
      headers: { cookie: fixture.org.owner.cookieHeader },
    });
    expect(response.status).toBe(StatusCodes.OK);

    const [comment] = await fetchComments(fixture, fixture.org.owner);
    expect(comment?.body).toBe('agent text');
    expect(comment?.author).toEqual({
      kind: 'agent',
      id: null,
      name: null,
      icon: null,
      tone: null,
    });
  });

  test('answers 404 to a user with no access to the workspace', async () => {
    const fixture = await seedFixture();
    const stranger = await seedAuthenticatedUser();

    const response = await listComments(fixture, stranger);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('does not list the comments of another task', async () => {
    const fixture = await seedFixture();
    await postCommentOk(fixture, fixture.org.owner, 'here');
    const otherTask = await app.request(`/workspace/${fixture.workspaceId}/task`, {
      method: 'POST',
      headers: jsonHeaders(fixture.org.owner),
      body: JSON.stringify({ title: 'Other' }),
    });
    const { task } = taskResponseSchema.parse(await otherTask.json());

    const comments = await fetchComments({ ...fixture, taskId: task.id }, fixture.org.owner);

    expect(comments).toEqual([]);
  });
});

describe('PATCH /workspace/:workspaceId/task/:taskId/comments/:commentId', () => {
  test('lets the author change the text and marks it edited', async () => {
    const fixture = await seedFixture();
    const created = await postCommentOk(fixture, fixture.org.member, 'typo');

    const response = await patchComment(fixture, fixture.org.member, created.id, 'fixed');

    expect(response.status).toBe(StatusCodes.OK);
    const { comment } = commentResponseSchema.parse(await response.json());
    expect(comment.body).toBe('fixed');
    expect(comment.editedAt).not.toBeNull();
    const [listed] = await fetchComments(fixture, fixture.org.owner);
    expect(listed).toMatchObject({ body: 'fixed' });
    expect(listed?.editedAt).not.toBeNull();
  });

  test('rejects an editor changing the comment of another user with 403', async () => {
    const fixture = await seedFixture();
    const created = await postCommentOk(fixture, fixture.org.member, 'mine');

    const response = await patchComment(fixture, fixture.org.otherMember, created.id, 'hijack');

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    const [listed] = await fetchComments(fixture, fixture.org.owner);
    expect(listed?.body).toBe('mine');
  });

  test('rejects a manager changing the comment of another user with 403', async () => {
    const fixture = await seedFixture();
    const created = await postCommentOk(fixture, fixture.org.member, 'mine');

    const response = await patchComment(fixture, fixture.org.owner, created.id, 'hijack');

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test('rejects an invalid body with 422', async () => {
    const fixture = await seedFixture();
    const created = await postCommentOk(fixture, fixture.org.owner, 'ok');

    const response = await patchComment(fixture, fixture.org.owner, created.id, '');

    await expectProblem(response, StatusCodes.UNPROCESSABLE_ENTITY, 'validation');
  });

  test('rejects editing an agent comment with task-comment-not-editable, even for a manager', async () => {
    const fixture = await seedFixture();
    const { commentId } = await insertAgentComment(fixture, 'fixed record');

    const asManager = await patchComment(fixture, fixture.org.owner, commentId, 'rewrite');
    const asEditor = await patchComment(fixture, fixture.org.member, commentId, 'rewrite');

    await expectProblem(asManager, StatusCodes.CONFLICT, 'task-comment-not-editable');
    await expectProblem(asEditor, StatusCodes.CONFLICT, 'task-comment-not-editable');
    const [listed] = await fetchComments(fixture, fixture.org.owner);
    expect(listed?.body).toBe('fixed record');
  });

  test('answers 404 for a comment that does not exist', async () => {
    const fixture = await seedFixture();

    const response = await patchComment(fixture, fixture.org.owner, Bun.randomUUIDv7(), 'x');

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('answers 404 for a comment that belongs to another task', async () => {
    const fixture = await seedFixture();
    const created = await postCommentOk(fixture, fixture.org.owner, 'here');
    const otherTask = await app.request(`/workspace/${fixture.workspaceId}/task`, {
      method: 'POST',
      headers: jsonHeaders(fixture.org.owner),
      body: JSON.stringify({ title: 'Other' }),
    });
    const { task } = taskResponseSchema.parse(await otherTask.json());

    const response = await patchComment(
      { ...fixture, taskId: task.id },
      fixture.org.owner,
      created.id,
      'x',
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /workspace/:workspaceId/task/:taskId/comments/:commentId', () => {
  test('lets the author delete their comment for everyone', async () => {
    const fixture = await seedFixture();
    const created = await postCommentOk(fixture, fixture.org.member, 'bye');

    const response = await deleteComment(fixture, fixture.org.member, created.id);

    expect(response.status).toBe(StatusCodes.OK);
    expect(await fetchComments(fixture, fixture.org.owner)).toEqual([]);
  });

  test('rejects an editor deleting the comment of another user with 403', async () => {
    const fixture = await seedFixture();
    const created = await postCommentOk(fixture, fixture.org.member, 'mine');

    const response = await deleteComment(fixture, fixture.org.otherMember, created.id);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await fetchComments(fixture, fixture.org.owner)).toHaveLength(1);
  });

  test('lets a workspace manager delete the comment of another user', async () => {
    const fixture = await seedFixture();
    const created = await postCommentOk(fixture, fixture.org.member, 'moderated');

    const response = await deleteComment(fixture, fixture.org.owner, created.id);

    expect(response.status).toBe(StatusCodes.OK);
    expect(await fetchComments(fixture, fixture.org.owner)).toEqual([]);
  });

  test('lets a workspace manager delete an agent comment, an editor not', async () => {
    const fixture = await seedFixture();
    const { commentId } = await insertAgentComment(fixture, 'run result');

    const asEditor = await deleteComment(fixture, fixture.org.member, commentId);
    const asManager = await deleteComment(fixture, fixture.org.owner, commentId);

    expect(asEditor.status).toBe(StatusCodes.FORBIDDEN);
    expect(asManager.status).toBe(StatusCodes.OK);
  });

  test('answers 404 for a comment that does not exist', async () => {
    const fixture = await seedFixture();

    const response = await deleteComment(fixture, fixture.org.owner, Bun.randomUUIDv7());

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('answers 404 for a comment that is already deleted', async () => {
    const fixture = await seedFixture();
    const created = await postCommentOk(fixture, fixture.org.owner, 'once');
    await deleteComment(fixture, fixture.org.owner, created.id);

    const response = await deleteComment(fixture, fixture.org.owner, created.id);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('is removed together with its task', async () => {
    const fixture = await seedFixture();
    await postCommentOk(fixture, fixture.org.owner, 'goes with the task');

    const response = await app.request(`/workspace/${fixture.workspaceId}/task/${fixture.taskId}`, {
      method: 'DELETE',
      headers: { cookie: fixture.org.owner.cookieHeader },
    });
    expect(response.status).toBe(StatusCodes.OK);

    const remaining = await db.query.taskComment.findMany({ where: { taskId: fixture.taskId } });
    expect(remaining).toEqual([]);
  });
});
