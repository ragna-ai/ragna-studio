import { db } from '@repo/database';
import { agent as agentTable } from '@repo/database/schema';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const LIMIT = 30_000;
const agentResponseSchema = z.object({
  agent: z.object({ id: z.string(), name: z.string(), systemPrompt: z.string() }),
});

function jsonRequest(cookieHeader: string, method: string, body: Record<string, unknown>) {
  return {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const limitedFields = ['systemPrompt', 'context'] as const;

describe('agent instruction and context length limits', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test.each(limitedFields)('create rejects a %s over the limit', async (field) => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();

    const response = await app.request(
      `/workspace/${workspaceId}/agent`,
      jsonRequest(cookieHeader, 'POST', {
        name: 'Bot',
        aiModelId,
        systemPrompt: 'Hi',
        [field]: 'a'.repeat(LIMIT + 1),
      }),
    );

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test.each(limitedFields)('create accepts a %s exactly at the limit', async (field) => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();

    const response = await app.request(
      `/workspace/${workspaceId}/agent`,
      jsonRequest(cookieHeader, 'POST', {
        name: 'Bot',
        aiModelId,
        systemPrompt: 'Hi',
        [field]: 'a'.repeat(LIMIT),
      }),
    );

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test('create still accepts an empty systemPrompt', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();

    const response = await app.request(
      `/workspace/${workspaceId}/agent`,
      jsonRequest(cookieHeader, 'POST', { name: 'Bot', aiModelId, systemPrompt: '' }),
    );

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test.each(limitedFields)('update rejects a %s over the limit', async (field) => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const [agent] = await db
      .insert(agentTable)
      .values({ userId, workspaceId, aiModelId, name: 'Bot', systemPrompt: 'Hi' })
      .returning({ id: agentTable.id });

    const response = await app.request(
      `/workspace/${workspaceId}/agent/${agent?.id}`,
      jsonRequest(cookieHeader, 'PATCH', { [field]: 'a'.repeat(LIMIT + 1) }),
    );

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test.each(limitedFields)('update accepts a %s exactly at the limit', async (field) => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const [agent] = await db
      .insert(agentTable)
      .values({ userId, workspaceId, aiModelId, name: 'Bot', systemPrompt: 'Hi' })
      .returning({ id: agentTable.id });

    const response = await app.request(
      `/workspace/${workspaceId}/agent/${agent?.id}`,
      jsonRequest(cookieHeader, 'PATCH', { [field]: 'a'.repeat(LIMIT) }),
    );

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('a stored systemPrompt over the limit survives a name-only update', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedTokenPricedAiModel();
    const longPrompt = 'a'.repeat(LIMIT + 5_000);
    const [agent] = await db
      .insert(agentTable)
      .values({ userId, workspaceId, aiModelId, name: 'Bot', systemPrompt: longPrompt })
      .returning({ id: agentTable.id });

    const response = await app.request(
      `/workspace/${workspaceId}/agent/${agent?.id}`,
      jsonRequest(cookieHeader, 'PATCH', { name: 'Renamed' }),
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = agentResponseSchema.parse(await response.json());
    expect(body.agent.name).toBe('Renamed');
    expect(body.agent.systemPrompt).toBe(longPrompt);
  });
});
