import { db } from '@repo/database';
import { agent as agentTable, workflow as workflowTable } from '@repo/database/schema';
import {
  seedAuthenticatedUser,
  seedCreditAccount,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import type { WorkflowDefinition } from '@repo/workflow';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const LIMIT = 30_000;

const triggerNode: WorkflowDefinition['nodes'][number] = {
  id: 'trigger-1',
  type: 'trigger',
  position: { x: 0, y: 0 },
  data: { label: 'Start', config: { kind: 'manual' } },
};

function agentNodeDefinition(agentId: string, prompt: string): WorkflowDefinition {
  return {
    nodes: [
      triggerNode,
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 0, y: 0 },
        data: { label: 'Agent', config: { agentId, prompt } },
      },
    ],
    edges: [],
  };
}

function teamNodeDefinition(agentId: string, prompt: string): WorkflowDefinition {
  return {
    nodes: [
      triggerNode,
      {
        id: 'team-1',
        type: 'team',
        position: { x: 0, y: 0 },
        data: {
          label: 'Team',
          config: {
            mode: 'delegate',
            leadAgentId: agentId,
            prompt,
            members: [{ agentId, role: '' }],
          },
        },
      },
    ],
    edges: [],
  };
}

const nodeKinds = [
  ['agent node', agentNodeDefinition],
  ['team node', teamNodeDefinition],
] as const;

async function seedAgent(userId: string, workspaceId: string): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();
  const [agent] = await db
    .insert(agentTable)
    .values({ userId, workspaceId, aiModelId, name: 'Bot', systemPrompt: 'Hi' })
    .returning({ id: agentTable.id });
  return agent?.id ?? '';
}

function jsonRequest(cookieHeader: string, method: string, body: Record<string, unknown>) {
  return {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('workflow node prompt length limit', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test.each(nodeKinds)('create rejects a %s prompt over the limit', async (_kind, build) => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await seedAgent(userId, workspaceId);

    const response = await app.request(
      `/workspace/${workspaceId}/workflow`,
      jsonRequest(cookieHeader, 'POST', {
        name: 'Flow',
        definition: build(agentId, 'a'.repeat(LIMIT + 1)),
      }),
    );

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test.each(nodeKinds)('create accepts a %s prompt exactly at the limit', async (_kind, build) => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await seedAgent(userId, workspaceId);

    const response = await app.request(
      `/workspace/${workspaceId}/workflow`,
      jsonRequest(cookieHeader, 'POST', {
        name: 'Flow',
        definition: build(agentId, 'a'.repeat(LIMIT)),
      }),
    );

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test.each(nodeKinds)('update rejects a %s prompt over the limit', async (_kind, build) => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const agentId = await seedAgent(userId, workspaceId);
    const [stored] = await db
      .insert(workflowTable)
      .values({ userId, workspaceId, name: 'Flow' })
      .returning({ id: workflowTable.id });

    const response = await app.request(
      `/workspace/${workspaceId}/workflow/${stored?.id}`,
      jsonRequest(cookieHeader, 'PATCH', { definition: build(agentId, 'a'.repeat(LIMIT + 1)) }),
    );

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('a stored workflow with a longer prompt is still readable and runnable', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedCreditAccount({ userId, balanceMicroCredits: 10_000_000n });
    const agentId = await seedAgent(userId, workspaceId);
    const definition = agentNodeDefinition(agentId, 'a'.repeat(LIMIT + 5_000));
    const [stored] = await db
      .insert(workflowTable)
      .values({
        userId,
        workspaceId,
        name: 'Flow',
        definition,
        publishedDefinition: definition,
      })
      .returning({ id: workflowTable.id });

    const readResponse = await app.request(`/workspace/${workspaceId}/workflow/${stored?.id}`, {
      headers: { cookie: cookieHeader },
    });
    const runResponse = await app.request(
      `/workspace/${workspaceId}/workflow/${stored?.id}/run`,
      jsonRequest(cookieHeader, 'POST', {}),
    );

    expect(readResponse.status).toBe(StatusCodes.OK);
    expect(runResponse.status).toBe(StatusCodes.OK);
    const run = z.object({ run: z.object({ status: z.string() }) }).parse(await runResponse.json());
    expect(run.run.status).toBe('pending');
  });
});
