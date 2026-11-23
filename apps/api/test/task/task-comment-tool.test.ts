import { taskToolDefinitions } from '@repo/ai';
import { createTask, db } from '@repo/database';
import { agent, taskComment } from '@repo/database/schema';
import { seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { expectProblem } from '../agent/agent-lock-fixtures';
import {
  seedOrganizationWithRoles,
  type OrganizationWithRoles,
} from '../workspace/workspace-access-fixtures';

const MAX_COMMENTS = 100;
const PARALLEL_WRITERS = 50;

const agentAuthorSchema = z.strictObject({
  kind: z.literal('agent'),
  id: z.string().nullable(),
  name: z.string().nullable(),
  icon: z.string().nullable(),
  tone: z.string().nullable(),
});
const userAuthorSchema = z.strictObject({
  kind: z.literal('user'),
  id: z.string().nullable(),
  name: z.string().nullable(),
});
const commentSchema = z.strictObject({
  id: z.string(),
  taskId: z.string(),
  body: z.string(),
  editedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  author: z.discriminatedUnion('kind', [userAuthorSchema, agentAuthorSchema]),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
const commentListSchema = z.strictObject({ comments: z.array(commentSchema) });
const toolSuccessSchema = z.strictObject({
  comment: z.strictObject({ id: z.string(), taskId: z.string(), displayId: z.string() }),
});

interface Fixture {
  org: OrganizationWithRoles;
  workspaceId: string;
  agentId: string;
  taskId: string;
  taskNumber: number;
}

async function insertAgent(workspaceId: string, userId: string): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();
  const [row] = await db
    .insert(agent)
    .values({
      userId,
      workspaceId,
      aiModelId,
      name: 'Helper',
      systemPrompt: 'x',
      icon: 'bot',
      tone: 'blue',
    })
    .returning({ id: agent.id });
  if (!row) throw new Error('agent not inserted');
  return row.id;
}

async function insertTask(workspaceId: string, userId: string) {
  return createTask({ workspaceId, title: 'A task', createdByUserId: userId });
}

async function seedFixture(): Promise<Fixture> {
  const org = await seedOrganizationWithRoles();
  const workspaceId = org.owner.workspaceId;
  const agentId = await insertAgent(workspaceId, org.owner.userId);
  const created = await insertTask(workspaceId, org.owner.userId);
  return { org, workspaceId, agentId, taskId: created.id, taskNumber: created.number };
}

function addTaskCommentTool(agentId: string) {
  const definition = taskToolDefinitions({ agentId }).find(({ name }) => name === 'addTaskComment');
  if (!definition) throw new Error('Missing addTaskComment tool');
  return definition;
}

function runTool(fixture: Fixture, input: { taskId: string; body: string }) {
  return addTaskCommentTool(fixture.agentId).execute(input, {
    userId: fixture.org.owner.userId,
    workspaceId: fixture.workspaceId,
    origin: 'agent',
  });
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

async function countComments(taskId: string): Promise<number> {
  const rows = await db.query.taskComment.findMany({ where: { taskId } });
  return rows.length;
}

function commentsPath({ workspaceId, taskId }: Fixture, commentId?: string) {
  const base = `/workspace/${workspaceId}/task/${taskId}/comments`;
  return commentId ? `${base}/${commentId}` : base;
}

function postUserComment(fixture: Fixture, body: string) {
  return app.request(commentsPath(fixture), {
    method: 'POST',
    headers: { cookie: fixture.org.owner.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

async function fetchComments(fixture: Fixture) {
  const response = await app.request(commentsPath(fixture), {
    headers: { cookie: fixture.org.owner.cookieHeader },
  });
  expect(response.status).toBe(StatusCodes.OK);
  return commentListSchema.parse(await response.json()).comments;
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('addTaskComment tool', () => {
  test('adds the comment last on the task with the agent as author', async () => {
    const fixture = await seedFixture();
    await insertUserComments(fixture, 1);

    const result = await runTool(fixture, { taskId: fixture.taskId, body: 'From **chat**' });

    const output = toolSuccessSchema.parse(result);
    expect(output.comment.taskId).toBe(fixture.taskId);
    expect(output.comment.displayId).toBe(`TSK-${fixture.taskNumber}`);
    const comments = await fetchComments(fixture);
    const last = comments.at(-1);
    expect(last?.id).toBe(output.comment.id);
    expect(last?.body).toBe('From **chat**');
    expect(last?.author).toMatchObject({ kind: 'agent', id: fixture.agentId });
  });

  test('leaves an agent comment read-only for users', async () => {
    const fixture = await seedFixture();
    const output = toolSuccessSchema.parse(
      await runTool(fixture, { taskId: fixture.taskId, body: 'Agent text' }),
    );

    const response = await app.request(commentsPath(fixture, output.comment.id), {
      method: 'PATCH',
      headers: { cookie: fixture.org.owner.cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Edited' }),
    });

    await expectProblem(response, StatusCodes.CONFLICT, 'task-comment-not-editable');
  });

  test('returns not_found for an unknown task and writes nothing', async () => {
    const fixture = await seedFixture();

    const result = await runTool(fixture, { taskId: 'does-not-exist', body: 'Hi' });

    expect(result).toMatchObject({ status: 'not_found' });
    expect(await countComments(fixture.taskId)).toBe(0);
  });

  test('returns not_found for a task of another workspace and writes nothing', async () => {
    const fixture = await seedFixture();
    const other = await seedFixture();

    const result = await runTool(fixture, { taskId: other.taskId, body: 'Hi' });

    expect(result).toMatchObject({ status: 'not_found' });
    expect(await countComments(other.taskId)).toBe(0);
  });

  test.each([
    ['an empty body', ''],
    ['a body over 10,000 characters', 'a'.repeat(10_001)],
  ])('rejects %s as invalid input', (_label, body) => {
    const { inputSchema } = addTaskCommentTool('agent-1');

    expect(inputSchema.safeParse({ taskId: 'task-1', body }).success).toBe(false);
  });

  test('returns limit_reached on a task with 100 comments and writes nothing', async () => {
    const fixture = await seedFixture();
    await insertUserComments(fixture, MAX_COMMENTS);

    const result = await runTool(fixture, { taskId: fixture.taskId, body: 'One more' });

    expect(result).toMatchObject({ status: 'limit_reached' });
    expect(await countComments(fixture.taskId)).toBe(MAX_COMMENTS);
  });

  test('rejects a user comment on a task holding 99 user and 1 agent comment', async () => {
    const fixture = await seedFixture();
    await insertUserComments(fixture, MAX_COMMENTS - 1);
    await runTool(fixture, { taskId: fixture.taskId, body: 'Agent' });

    const response = await postUserComment(fixture, 'One more');

    await expectProblem(response, StatusCodes.CONFLICT, 'task-comment-limit-reached');
    expect(await countComments(fixture.taskId)).toBe(MAX_COMMENTS);
  });

  test('never exceeds the cap when users and the agent post on one task at the same time', async () => {
    const fixture = await seedFixture();
    await insertUserComments(fixture, MAX_COMMENTS - 1);

    await Promise.all(
      Array.from({ length: PARALLEL_WRITERS }, (_, index) =>
        index % 2 === 0
          ? postUserComment(fixture, `From user ${index}`)
          : runTool(fixture, { taskId: fixture.taskId, body: `From agent ${index}` }),
      ),
    );

    expect(await countComments(fixture.taskId)).toBe(MAX_COMMENTS);
  });
});
