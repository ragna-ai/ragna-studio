import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// An agent may only pin a default dataset of its own workspace.

const idSchema = z.object({ id: z.string() });
const agentSchema = z.object({ id: z.string(), defaultDatasetId: z.string().nullable() });
const agentResponseSchema = z.object({ agent: agentSchema });

function jsonRequest(cookieHeader: string, method: string, body: Record<string, unknown>) {
  return {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function createWorkspace(cookieHeader: string): Promise<string> {
  const response = await app.request(
    '/workspace',
    jsonRequest(cookieHeader, 'POST', { name: 'Second' }),
  );
  return z.object({ workspace: idSchema }).parse(await response.json()).workspace.id;
}

async function createDataset(cookieHeader: string, workspaceId: string): Promise<string> {
  const response = await app.request(
    `/workspace/${workspaceId}/dataset`,
    jsonRequest(cookieHeader, 'POST', {
      name: 'Leads',
      columns: [{ id: 'col-name', name: 'Name', type: 'text' }],
    }),
  );
  return z.object({ dataset: idSchema }).parse(await response.json()).dataset.id;
}

async function postAgent(
  cookieHeader: string,
  workspaceId: string,
  body: Record<string, unknown> = {},
) {
  const { aiModelId } = await seedTokenPricedAiModel();
  return app.request(
    `/workspace/${workspaceId}/agent`,
    jsonRequest(cookieHeader, 'POST', {
      name: 'Agent',
      aiModelId,
      systemPrompt: 'Help.',
      ...body,
    }),
  );
}

async function getAgent(cookieHeader: string, workspaceId: string, agentId: string) {
  const response = await app.request(`/workspace/${workspaceId}/agent/${agentId}`, {
    headers: { cookie: cookieHeader },
  });
  return agentResponseSchema.parse(await response.json()).agent;
}

async function countAgents(cookieHeader: string, workspaceId: string): Promise<number> {
  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    headers: { cookie: cookieHeader },
  });
  return z.object({ agents: z.array(idSchema) }).parse(await response.json()).agents.length;
}

interface ForeignDatasetCase {
  name: string;
  setup: () => Promise<{ cookieHeader: string; workspaceId: string; foreignDatasetId: string }>;
}

const foreignDatasetCases: ForeignDatasetCase[] = [
  {
    name: 'another user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const userB = await seedAuthenticatedUser();
      const foreignDatasetId = await createDataset(userB.cookieHeader, userB.workspaceId);
      return { ...userA, foreignDatasetId };
    },
  },
  {
    name: 'another workspace of the same user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const otherWorkspaceId = await createWorkspace(userA.cookieHeader);
      const foreignDatasetId = await createDataset(userA.cookieHeader, otherWorkspaceId);
      return { ...userA, foreignDatasetId };
    },
  },
];

describe('agent defaultDatasetId stays inside the workspace', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  for (const { name, setup } of foreignDatasetCases) {
    test(`POST rejects a dataset from ${name} and creates nothing`, async () => {
      const { cookieHeader, workspaceId, foreignDatasetId } = await setup();
      const agentsBefore = await countAgents(cookieHeader, workspaceId);

      const response = await postAgent(cookieHeader, workspaceId, {
        defaultDatasetId: foreignDatasetId,
      });

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await countAgents(cookieHeader, workspaceId)).toBe(agentsBefore);
    });

    test(`PATCH rejects a dataset from ${name} and keeps the old dataset`, async () => {
      const { cookieHeader, workspaceId, foreignDatasetId } = await setup();
      const ownDatasetId = await createDataset(cookieHeader, workspaceId);
      const created = await postAgent(cookieHeader, workspaceId, {
        defaultDatasetId: ownDatasetId,
      });
      const { agent } = agentResponseSchema.parse(await created.json());

      const response = await app.request(
        `/workspace/${workspaceId}/agent/${agent.id}`,
        jsonRequest(cookieHeader, 'PATCH', { defaultDatasetId: foreignDatasetId }),
      );

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      const unchanged = await getAgent(cookieHeader, workspaceId, agent.id);
      expect(unchanged.defaultDatasetId).toBe(ownDatasetId);
    });
  }

  test('pins a dataset of the same workspace and clears it again', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const datasetId = await createDataset(cookieHeader, workspaceId);

    const created = await postAgent(cookieHeader, workspaceId, { defaultDatasetId: datasetId });
    expect(created.status).toBe(StatusCodes.CREATED);
    const { agent } = agentResponseSchema.parse(await created.json());
    expect(agent.defaultDatasetId).toBe(datasetId);

    const cleared = await app.request(
      `/workspace/${workspaceId}/agent/${agent.id}`,
      jsonRequest(cookieHeader, 'PATCH', { defaultDatasetId: null }),
    );
    expect(cleared.status).toBe(StatusCodes.OK);
    expect((await getAgent(cookieHeader, workspaceId, agent.id)).defaultDatasetId).toBeNull();
  });

  test('deleting the pinned dataset clears the pin', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const datasetId = await createDataset(cookieHeader, workspaceId);
    const created = await postAgent(cookieHeader, workspaceId, { defaultDatasetId: datasetId });
    const { agent } = agentResponseSchema.parse(await created.json());

    const deleteResponse = await app.request(`/workspace/${workspaceId}/dataset/${datasetId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(deleteResponse.status).toBe(StatusCodes.OK);
    expect((await getAgent(cookieHeader, workspaceId, agent.id)).defaultDatasetId).toBeNull();
  });
});
