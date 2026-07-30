import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Aggregated read for /workspace/:workspaceId/overview: five capped
// sections (tasks, chats, workflows, agents, documents) plus a workspace
// total per section (docs/home/prd.md). Auth/authorization are covered
// exhaustively in test/auth/; this file only checks the overview feature's
// own aggregation, cap, and total-count behavior.

function sectionSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({ items: z.array(itemSchema), total: z.number() });
}

const taskItemSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  status: z.string(),
  priority: z.string(),
  dueDate: z.string().nullable(),
  updatedAt: z.string(),
});

const chatItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  agentName: z.string(),
  updatedAt: z.string(),
});

const workflowItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastRunStatus: z.string().nullable(),
  updatedAt: z.string(),
});

const agentItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  modelName: z.string(),
  updatedAt: z.string(),
});

const documentItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
});

const overviewResponseSchema = z.object({
  tasks: sectionSchema(taskItemSchema),
  chats: sectionSchema(chatItemSchema),
  workflows: sectionSchema(workflowItemSchema),
  agents: sectionSchema(agentItemSchema),
  documents: sectionSchema(documentItemSchema),
});

async function createTask(cookieHeader: string, workspaceId: string, title: string) {
  return app.request(`/workspace/${workspaceId}/task`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

async function createDocument(cookieHeader: string, workspaceId: string, title: string) {
  return app.request(`/workspace/${workspaceId}/document`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

async function getOverview(cookieHeader: string, workspaceId: string) {
  const response = await app.request(`/workspace/${workspaceId}/overview`, {
    headers: { cookie: cookieHeader },
  });
  return { status: response.status, body: overviewResponseSchema.parse(await response.json()) };
}

describe('GET /workspace/:workspaceId/overview', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('rejects unauthenticated requests', async () => {
    const { workspaceId } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/overview`);

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('is empty for a fresh workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const { status, body } = await getOverview(cookieHeader, workspaceId);

    expect(status).toBe(StatusCodes.OK);
    expect(body.tasks).toEqual({ items: [], total: 0 });
    expect(body.chats).toEqual({ items: [], total: 0 });
    expect(body.workflows).toEqual({ items: [], total: 0 });
    expect(body.agents).toEqual({ items: [], total: 0 });
    expect(body.documents).toEqual({ items: [], total: 0 });
  });

  test('reflects tasks and documents created in the workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await createTask(cookieHeader, workspaceId, 'Ship the release');
    await createDocument(cookieHeader, workspaceId, 'Launch notes');

    const { body } = await getOverview(cookieHeader, workspaceId);

    expect(body.tasks.total).toBe(1);
    expect(body.tasks.items.map((task) => task.title)).toEqual(['Ship the release']);
    expect(body.documents.total).toBe(1);
    expect(body.documents.items.map((document) => document.title)).toEqual(['Launch notes']);
  });

  test('caps items at 5 but reports the full total', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    for (let index = 0; index < 6; index += 1) {
      await createTask(cookieHeader, workspaceId, `Task ${index}`);
    }

    const { body } = await getOverview(cookieHeader, workspaceId);

    expect(body.tasks.items.length).toBe(5);
    expect(body.tasks.total).toBe(6);
  });
});
