import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// A workflow definition may only reference agents of its own workspace.

const idSchema = z.object({ id: z.string() });
const notFoundSchema = z.object({ code: z.number(), error: z.string() });
const workflowResponseSchema = z.object({
  workflow: z.strictObject({
    id: z.string(),
    workspaceId: z.string(),
    userId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    definition: z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }),
    publishedDefinition: z.unknown(),
    scheduleCron: z.string().nullable(),
    scheduleTimezone: z.string().nullable(),
    schedulePaused: z.boolean().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable().optional(),
  }),
});

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
    jsonRequest(cookieHeader, 'POST', { name: 'Second', visibility: 'organization' }),
  );
  return z.object({ workspace: idSchema }).parse(await response.json()).workspace.id;
}

async function createAgent(cookieHeader: string, workspaceId: string): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();
  const response = await app.request(
    `/workspace/${workspaceId}/agent`,
    jsonRequest(cookieHeader, 'POST', { name: 'Agent', aiModelId, systemPrompt: 'Help.' }),
  );
  return z.object({ agent: idSchema }).parse(await response.json()).agent.id;
}

const triggerNode = {
  id: 'trigger-1',
  type: 'trigger',
  position: { x: 0, y: 0 },
  data: { label: 'Start', config: { kind: 'manual' } },
};

function agentNodeDefinition(agentId: string) {
  return {
    nodes: [
      triggerNode,
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 0, y: 0 },
        data: { label: 'Agent', config: { agentId, prompt: 'Do it' } },
      },
    ],
    edges: [],
  };
}

function teamDefinition(config: { leadAgentId?: string; memberAgentIds: string[] }) {
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
            leadAgentId: config.leadAgentId,
            prompt: '{{input}}',
            members: config.memberAgentIds.map((agentId) => ({ agentId, role: '' })),
          },
        },
      },
    ],
    edges: [],
  };
}

interface DefinitionLocation {
  name: string;
  build: (foreignAgentId: string, ownAgentId: string) => Record<string, unknown>;
}

const definitionLocations: DefinitionLocation[] = [
  { name: 'an agent node', build: (foreignAgentId) => agentNodeDefinition(foreignAgentId) },
  {
    name: 'a team lead',
    build: (foreignAgentId, ownAgentId) =>
      teamDefinition({ leadAgentId: foreignAgentId, memberAgentIds: [ownAgentId] }),
  },
  {
    name: 'a team member',
    build: (foreignAgentId, ownAgentId) =>
      teamDefinition({ memberAgentIds: [ownAgentId, foreignAgentId] }),
  },
];

interface ForeignAgentCase {
  name: string;
  setup: () => Promise<{
    cookieHeader: string;
    workspaceId: string;
    foreignAgentId: string;
    ownAgentId: string;
  }>;
}

const foreignAgentCases: ForeignAgentCase[] = [
  {
    name: 'another user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const userB = await seedAuthenticatedUser();
      const foreignAgentId = await createAgent(userB.cookieHeader, userB.workspaceId);
      const ownAgentId = await createAgent(userA.cookieHeader, userA.workspaceId);
      return { ...userA, foreignAgentId, ownAgentId };
    },
  },
  {
    name: 'another workspace of the same user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const otherWorkspaceId = await createWorkspace(userA.cookieHeader);
      const foreignAgentId = await createAgent(userA.cookieHeader, otherWorkspaceId);
      const ownAgentId = await createAgent(userA.cookieHeader, userA.workspaceId);
      return { ...userA, foreignAgentId, ownAgentId };
    },
  },
];

async function postWorkflow(cookieHeader: string, workspaceId: string, definition: unknown) {
  return app.request(
    `/workspace/${workspaceId}/workflow`,
    jsonRequest(cookieHeader, 'POST', { name: 'Flow', definition: definition as object }),
  );
}

async function patchWorkflow(
  cookieHeader: string,
  workspaceId: string,
  workflowId: string,
  body: Record<string, unknown>,
) {
  return app.request(
    `/workspace/${workspaceId}/workflow/${workflowId}`,
    jsonRequest(cookieHeader, 'PATCH', body),
  );
}

async function getWorkflowDefinition(cookieHeader: string, workspaceId: string, id: string) {
  const response = await app.request(`/workspace/${workspaceId}/workflow/${id}`, {
    headers: { cookie: cookieHeader },
  });
  return workflowResponseSchema.parse(await response.json()).workflow.definition;
}

async function listWorkflowCount(cookieHeader: string, workspaceId: string): Promise<number> {
  const response = await app.request(`/workspace/${workspaceId}/workflow`, {
    headers: { cookie: cookieHeader },
  });
  return z.object({ workflows: z.array(idSchema) }).parse(await response.json()).workflows.length;
}

describe('workflow definition agents stay inside the workspace', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  for (const { name: caseName, setup } of foreignAgentCases) {
    for (const location of definitionLocations) {
      test(`POST rejects ${location.name} agent from ${caseName} and creates nothing`, async () => {
        const { cookieHeader, workspaceId, foreignAgentId, ownAgentId } = await setup();

        const response = await postWorkflow(
          cookieHeader,
          workspaceId,
          location.build(foreignAgentId, ownAgentId),
        );

        expect(response.status).toBe(StatusCodes.NOT_FOUND);
        expect(notFoundSchema.parse(await response.json()).error).toBe('Agent not found');
        expect(await listWorkflowCount(cookieHeader, workspaceId)).toBe(0);
      });

      test(`PATCH rejects ${location.name} agent from ${caseName} and keeps the definition`, async () => {
        const { cookieHeader, workspaceId, foreignAgentId, ownAgentId } = await setup();
        const created = await postWorkflow(cookieHeader, workspaceId, { nodes: [], edges: [] });
        const { id } = workflowResponseSchema.parse(await created.json()).workflow;

        const response = await patchWorkflow(cookieHeader, workspaceId, id, {
          definition: location.build(foreignAgentId, ownAgentId),
        });

        expect(response.status).toBe(StatusCodes.NOT_FOUND);
        expect(notFoundSchema.parse(await response.json()).error).toBe('Agent not found');
        expect(await getWorkflowDefinition(cookieHeader, workspaceId, id)).toEqual({
          nodes: [],
          edges: [],
        });
      });
    }
  }

  test('POST accepts agents of the same workspace in every location', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const otherAgentId = await createAgent(cookieHeader, workspaceId);

    for (const definition of [
      agentNodeDefinition(agentId),
      teamDefinition({ leadAgentId: agentId, memberAgentIds: [agentId, otherAgentId] }),
    ]) {
      const response = await postWorkflow(cookieHeader, workspaceId, definition);
      expect(response.status).toBe(StatusCodes.CREATED);
    }
  });

  test('PATCH accepts agents of the same workspace', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const created = await postWorkflow(cookieHeader, workspaceId, { nodes: [], edges: [] });
    const { id } = workflowResponseSchema.parse(await created.json()).workflow;

    const response = await patchWorkflow(cookieHeader, workspaceId, id, {
      definition: agentNodeDefinition(agentId),
    });

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('POST accepts a definition without agents', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();

    const response = await postWorkflow(cookieHeader, workspaceId, { nodes: [], edges: [] });

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test('PATCH without a definition still succeeds', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const created = await postWorkflow(cookieHeader, workspaceId, { nodes: [], edges: [] });
    const { id } = workflowResponseSchema.parse(await created.json()).workflow;

    const response = await patchWorkflow(cookieHeader, workspaceId, id, { name: 'Renamed' });

    expect(response.status).toBe(StatusCodes.OK);
  });
});
