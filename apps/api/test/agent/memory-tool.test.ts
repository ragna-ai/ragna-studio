import { buildAgentToolset } from '@repo/ai';
import { getMemoryByAgentId } from '@repo/database';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { app } from '../../src/app';
import { stubToolExecutionOptions } from '../stub-tool-execution-options';

const createdAgentSchema = z.object({ agent: z.object({ id: z.string() }) });
const savedSchema = z.strictObject({ ok: z.literal(true) });
const failureSchema = z.strictObject({ status: z.string(), message: z.string() });

async function setUpMemoryTool() {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const { aiModelId } = await seedTokenPricedAiModel();
  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Rememberer', aiModelId, systemPrompt: 'You are helpful.' }),
  });
  const { agent } = createdAgentSchema.parse(await response.json());
  const tools = buildAgentToolset([{ id: 'memory' }], {
    userId,
    agentId: agent.id,
    workspaceId,
  });
  const execute = tools.memory?.execute;
  if (!execute) {
    throw new Error('memory tool has no execute');
  }
  return {
    agentId: agent.id,
    remember: (input: Record<string, string>) => execute(input, stubToolExecutionOptions),
  };
}

describe('memory tool', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('appends a fact to the memory document', async () => {
    const { agentId, remember } = await setUpMemoryTool();

    savedSchema.parse(await remember({ action: 'append', text: 'Likes tea' }));
    savedSchema.parse(await remember({ action: 'append', text: 'Lives in Berlin' }));

    const memory = await getMemoryByAgentId({ agentId });
    expect(memory?.content).toBe('Likes tea\n\nLives in Berlin');
  });

  test('reports invalid input when append has no text', async () => {
    const { remember } = await setUpMemoryTool();

    const result = failureSchema.parse(await remember({ action: 'append' }));

    expect(result.status).toBe('invalid_input');
  });

  test('reports not found when the text to replace is missing', async () => {
    const { remember } = await setUpMemoryTool();

    const result = failureSchema.parse(await remember({ action: 'replace', old: 'nothing' }));

    expect(result.status).toBe('not_found');
  });

  test('reports ambiguous when the text to replace matches twice', async () => {
    const { remember } = await setUpMemoryTool();
    await remember({ action: 'append', text: 'tea tea' });

    const result = failureSchema.parse(await remember({ action: 'replace', old: 'tea' }));

    expect(result.status).toBe('ambiguous');
  });
});
