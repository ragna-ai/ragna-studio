import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Plain CRUD + memory endpoints for /workspace/:workspaceId/agent (docs/
// testing/strategy.md, priority 3). Auth/authorization are covered
// exhaustively in test/auth/ and test/workspace/workspace-authorization.test.ts;
// this file only checks the agent feature's own behavior.

const agentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  aiModelId: z.string(),
  systemPrompt: z.string(),
  isDefault: z.boolean(),
});

// The list endpoint (getAgentsByWorkspaceId, packages/database/src/
// repositories/agent.repo.ts) selects a narrower column set than the
// single-agent responses below: no workspaceId/aiModelId/systemPrompt, and
// the AI model comes through as a nested relation instead of a bare id.
const agentListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
});

const agentListResponseSchema = z.object({
  agents: z.array(agentListItemSchema),
  meta: z.object({ totalCount: z.number() }),
});
const agentResponseSchema = z.object({ agent: agentSchema });
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
