import { db } from '@repo/database';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Plain CRUD + memory endpoints for /workspace/:workspaceId/agent.
// Auth/authorization are covered
// exhaustively in test/auth/ and test/workspace/workspace-authorization.test.ts;
// this file only checks the agent feature's own behavior.

const toolGrantsSchema = z.array(
  z.union([
    z.strictObject({ id: z.string() }),
    z.strictObject({ id: z.string(), access: z.enum(['read', 'write']) }),
  ]),
);

const agentSchema = z.strictObject({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  aiModelId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  systemPrompt: z.string(),
  context: z.string().nullable(),
  toolGrants: toolGrantsSchema,
  defaultDatasetId: z.string().nullable(),
  icon: z.string().nullable(),
  tone: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageMediaId: z.string().nullable(),
  settings: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

// The list endpoint selects a narrower column set, with the AI model as a nested relation.
const agentListItemSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  toolGrants: toolGrantsSchema,
  icon: z.string().nullable(),
  tone: z.string().nullable(),
  imageUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  aiModel: z.strictObject({ provider: z.string(), model: z.string(), displayName: z.string() }),
});

const agentListResponseSchema = z.object({
  agents: z.array(agentListItemSchema),
  meta: z.object({ totalCount: z.number() }),
});
const agentResponseSchema = z.object({ agent: agentSchema });
// GET returns the agent with its AI model relation attached.
const agentWithModelResponseSchema = z.object({
  agent: agentSchema.extend({ aiModel: z.record(z.string(), z.unknown()) }),
});
const agentMemoryResponseSchema = z.object({ memory: z.object({ content: z.string() }) });

async function createAgent(
  cookieHeader: string,
  workspaceId: string,
  body: Record<string, unknown>,
) {
  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    agent: agentResponseSchema.parse(await response.json()).agent,
  };
}

describe('GET /workspace/:workspaceId/agent', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const { workspaceId } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/agent`);

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/agent`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = agentListResponseSchema.parse(await response.json());
    expect(body.agents).toEqual([]);
    expect(body.meta.totalCount).toBe(0);
  });

  test('shows a created agent in the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Support bot',
      aiModelId,
      systemPrompt: 'You are helpful.',
    });

    const response = await app.request(`/workspace/${workspaceId}/agent`, {
      headers: { cookie: cookieHeader },
    });
    const body = agentListResponseSchema.parse(await response.json());
    expect(body.agents.map((agent) => agent.id)).toEqual([created.id]);
  });
});

describe('POST /workspace/:workspaceId/agent', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('creates an agent from a minimal body', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();

    const { status, agent } = await createAgent(cookieHeader, workspaceId, {
      name: 'Support bot',
      aiModelId,
      systemPrompt: 'You are helpful.',
    });

    expect(status).toBe(StatusCodes.CREATED);
    expect(agent.name).toBe('Support bot');
    expect(agent.aiModelId).toBe(aiModelId);
    expect(agent.workspaceId).toBe(workspaceId);
  });

  test('rejects an unknown isDefault flag in the body', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();

    const response = await app.request(`/workspace/${workspaceId}/agent`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Support bot',
        aiModelId,
        systemPrompt: 'You are helpful.',
        isDefault: true,
      }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('rejects an empty name', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();

    const response = await app.request(`/workspace/${workspaceId}/agent`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', aiModelId, systemPrompt: 'You are helpful.' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('GET /workspace/:workspaceId/agent/:agentId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('404s for an agent id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Doomed',
      aiModelId,
      systemPrompt: 'You are helpful.',
    });
    await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('PATCH /workspace/:workspaceId/agent/:agentId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('applies a partial update', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Original',
      aiModelId,
      systemPrompt: 'Original prompt',
    });

    const response = await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = agentResponseSchema.parse(await response.json());
    expect(body.agent.name).toBe('Renamed');
    expect(body.agent.systemPrompt).toBe('Original prompt');
  });

  test.each([
    ['an empty body', {}],
    ['only an isDefault flag', { isDefault: true }],
  ])('rejects %s with no updatable field', async (_label, body) => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Original',
      aiModelId,
      systemPrompt: 'Original prompt',
    });

    const response = await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('rejects an unknown isDefault flag in the body', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Original',
      aiModelId,
      systemPrompt: 'Original prompt',
    });

    const response = await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', isDefault: true }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('404s for an agent id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Doomed',
      aiModelId,
      systemPrompt: 'You are helpful.',
    });
    await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ghost' }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('agent tool grants', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  async function patchAgent(
    cookieHeader: string,
    workspaceId: string,
    agentId: string,
    body: Record<string, unknown>,
  ) {
    return app.request(`/workspace/${workspaceId}/agent/${agentId}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function postAgent(cookieHeader: string, workspaceId: string, body: Record<string, unknown>) {
    return app.request(`/workspace/${workspaceId}/agent`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function seedAgent(toolGrants?: Record<string, unknown>[]) {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent } = await createAgent(cookieHeader, workspaceId, {
      name: 'Researcher',
      aiModelId,
      systemPrompt: 'You are helpful.',
      toolGrants,
    });
    return { workspaceId, cookieHeader, aiModelId, agent };
  }

  async function storedToolGrants(agentId: string) {
    const stored = await db.query.agent.findFirst({ where: { id: agentId } });
    return stored?.toolGrants;
  }

  test('defaults to no tool grants', async () => {
    const { agent } = await seedAgent();

    expect(agent.toolGrants).toEqual([]);
  });

  test('stores tool grants on create and returns them on get', async () => {
    const grants = [{ id: 'webSearch' }, { id: 'google-drive', access: 'read' }];
    const { workspaceId, cookieHeader, agent: created } = await seedAgent(grants);

    expect(created.toolGrants).toEqual(grants);
    const response = await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      headers: { cookie: cookieHeader },
    });
    expect(agentWithModelResponseSchema.parse(await response.json()).agent.toolGrants).toEqual(
      grants,
    );
  });

  test('updates the access level and clears the grants with an empty list', async () => {
    const {
      workspaceId,
      cookieHeader,
      agent: created,
    } = await seedAgent([{ id: 'google-drive', access: 'read' }]);

    const upgraded = await patchAgent(cookieHeader, workspaceId, created.id, {
      toolGrants: [{ id: 'google-drive', access: 'write' }],
    });
    expect(agentResponseSchema.parse(await upgraded.json()).agent.toolGrants).toEqual([
      { id: 'google-drive', access: 'write' },
    ]);

    const cleared = await patchAgent(cookieHeader, workspaceId, created.id, { toolGrants: [] });
    expect(agentResponseSchema.parse(await cleared.json()).agent.toolGrants).toEqual([]);
  });

  test('the workspace agent list returns the tool grants', async () => {
    const grants = [{ id: 'think' }, { id: 'google-drive', access: 'write' }];
    const { workspaceId, cookieHeader } = await seedAgent(grants);

    const response = await app.request(`/workspace/${workspaceId}/agent`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const { agents } = agentListResponseSchema.parse(await response.json());
    expect(agents.map((agent) => agent.toolGrants)).toEqual([grants]);
  });

  test.each([
    ['a duplicate tool id', [{ id: 'webSearch' }, { id: 'webSearch' }]],
    ['an integration grant without access', [{ id: 'google-drive' }]],
    ['a built-in grant with access', [{ id: 'webSearch', access: 'read' }]],
    ['an unknown access level', [{ id: 'google-drive', access: 'admin' }]],
    ['an unknown tool id', [{ id: 'dropbox', access: 'read' }]],
  ])('rejects %s with 422 and changes nothing', async (_label, toolGrants) => {
    const original = [{ id: 'think' }];
    const { workspaceId, cookieHeader, aiModelId, agent: created } = await seedAgent(original);

    const createResponse = await postAgent(cookieHeader, workspaceId, {
      name: 'Other',
      aiModelId,
      systemPrompt: 'You are helpful.',
      toolGrants,
    });
    const updateResponse = await patchAgent(cookieHeader, workspaceId, created.id, { toolGrants });

    expect(createResponse.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(updateResponse.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(await storedToolGrants(created.id)).toEqual(original);
    expect((await db.query.agent.findMany({ where: { workspaceId } })).length).toBe(1);
  });

  test.each([
    ['tools', { tools: ['webSearch'] }],
    ['integrationTools', { integrationTools: { 'google-drive': 'read' } }],
  ])('rejects the old %s body with 422 and changes nothing', async (_label, oldFields) => {
    const original = [{ id: 'think' }];
    const { workspaceId, cookieHeader, aiModelId, agent: created } = await seedAgent(original);

    const createResponse = await postAgent(cookieHeader, workspaceId, {
      name: 'Other',
      aiModelId,
      systemPrompt: 'You are helpful.',
      ...oldFields,
    });
    const updateResponse = await patchAgent(cookieHeader, workspaceId, created.id, oldFields);

    expect(createResponse.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(updateResponse.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(await storedToolGrants(created.id)).toEqual(original);
    expect((await db.query.agent.findMany({ where: { workspaceId } })).length).toBe(1);
  });
});

describe('DELETE /workspace/:workspaceId/agent/:agentId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('removes the agent from the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Temp',
      aiModelId,
      systemPrompt: 'You are helpful.',
    });

    const deleteResponse = await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/agent`, {
      headers: { cookie: cookieHeader },
    });
    const body = agentListResponseSchema.parse(await listResponse.json());
    expect(body.agents).toEqual([]);
  });
});

describe('GET /workspace/:workspaceId/agent/:agentId/memory', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('is an empty string before any memory has been written', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Rememberer',
      aiModelId,
      systemPrompt: 'You are helpful.',
    });

    const response = await app.request(`/workspace/${workspaceId}/agent/${created.id}/memory`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = agentMemoryResponseSchema.parse(await response.json());
    expect(body.memory.content).toBe('');
  });

  test('404s for an agent id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Doomed',
      aiModelId,
      systemPrompt: 'You are helpful.',
    });
    await app.request(`/workspace/${workspaceId}/agent/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/agent/${created.id}/memory`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('PUT /workspace/:workspaceId/agent/:agentId/memory', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('replaces the memory content, reflected on a subsequent GET', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const { agent: created } = await createAgent(cookieHeader, workspaceId, {
      name: 'Rememberer',
      aiModelId,
      systemPrompt: 'You are helpful.',
    });

    await app.request(`/workspace/${workspaceId}/agent/${created.id}/memory`, {
      method: 'PUT',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'First version' }),
    });

    // A second PUT overwrites rather than appending, confirming this route
    // replaces the memory document instead of accumulating it.
    const putResponse = await app.request(`/workspace/${workspaceId}/agent/${created.id}/memory`, {
      method: 'PUT',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Second version' }),
    });

    expect(putResponse.status).toBe(StatusCodes.OK);
    const putBody = agentMemoryResponseSchema.parse(await putResponse.json());
    expect(putBody.memory.content).toBe('Second version');

    const getResponse = await app.request(`/workspace/${workspaceId}/agent/${created.id}/memory`, {
      headers: { cookie: cookieHeader },
    });
    const getBody = agentMemoryResponseSchema.parse(await getResponse.json());
    expect(getBody.memory.content).toBe('Second version');
  });
});
