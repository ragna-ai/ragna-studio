import { getUpdateTaskTool } from '@repo/ai';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { stubStreamWriter } from '../stub-stream-writer';

// A task may only reference an agent or labels of its own workspace.

const idSchema = z.object({ id: z.string() });
const taskSchema = z.object({ id: z.string(), assignedAgentId: z.string().nullable() });
const taskResponseSchema = z.object({ task: taskSchema });
const taskDetailSchema = taskSchema.extend({ labels: z.array(idSchema) });

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

async function createAgent(cookieHeader: string, workspaceId: string): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();
  const response = await app.request(
    `/workspace/${workspaceId}/agent`,
    jsonRequest(cookieHeader, 'POST', { name: 'Agent', aiModelId, systemPrompt: 'Help.' }),
  );
  return z.object({ agent: idSchema }).parse(await response.json()).agent.id;
}

async function createLabel(cookieHeader: string, workspaceId: string): Promise<string> {
  const response = await app.request(
    `/workspace/${workspaceId}/task-label`,
    jsonRequest(cookieHeader, 'POST', { name: 'Bug', color: '#ff0000' }),
  );
  return z.object({ taskLabel: idSchema }).parse(await response.json()).taskLabel.id;
}

async function postTask(cookieHeader: string, workspaceId: string, body: Record<string, unknown>) {
  return app.request(
    `/workspace/${workspaceId}/task`,
    jsonRequest(cookieHeader, 'POST', { title: 'A task', ...body }),
  );
}

async function patchTask(
  cookieHeader: string,
  workspaceId: string,
  taskId: string,
  body: Record<string, unknown>,
) {
  return app.request(
    `/workspace/${workspaceId}/task/${taskId}`,
    jsonRequest(cookieHeader, 'PATCH', body),
  );
}

async function listTaskCount(cookieHeader: string, workspaceId: string): Promise<number> {
  const response = await app.request(`/workspace/${workspaceId}/task`, {
    headers: { cookie: cookieHeader },
  });
  return z.object({ tasks: z.array(idSchema) }).parse(await response.json()).tasks.length;
}

async function getTask(cookieHeader: string, workspaceId: string, taskId: string) {
  const response = await app.request(`/workspace/${workspaceId}/task/${taskId}`, {
    headers: { cookie: cookieHeader },
  });
  return z.object({ task: taskDetailSchema }).parse(await response.json()).task;
}

interface ForeignResourceCase {
  name: string;
  setup: () => Promise<{ cookieHeader: string; workspaceId: string; foreignId: string }>;
}

const foreignAgentCases: ForeignResourceCase[] = [
  {
    name: 'another user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const userB = await seedAuthenticatedUser();
      const foreignId = await createAgent(userB.cookieHeader, userB.workspaceId);
      return { ...userA, foreignId };
    },
  },
  {
    name: 'another workspace of the same user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const otherWorkspaceId = await createWorkspace(userA.cookieHeader);
      const foreignId = await createAgent(userA.cookieHeader, otherWorkspaceId);
      return { ...userA, foreignId };
    },
  },
];

const foreignLabelCases: ForeignResourceCase[] = [
  {
    name: 'another user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const userB = await seedAuthenticatedUser();
      const foreignId = await createLabel(userB.cookieHeader, userB.workspaceId);
      return { ...userA, foreignId };
    },
  },
  {
    name: 'another workspace of the same user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const otherWorkspaceId = await createWorkspace(userA.cookieHeader);
      const foreignId = await createLabel(userA.cookieHeader, otherWorkspaceId);
      return { ...userA, foreignId };
    },
  },
];

describe('task assignedAgentId stays inside the workspace', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  for (const { name, setup } of foreignAgentCases) {
    test(`POST rejects an agent from ${name} and creates nothing`, async () => {
      const { cookieHeader, workspaceId, foreignId } = await setup();

      const response = await postTask(cookieHeader, workspaceId, { assignedAgentId: foreignId });

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await listTaskCount(cookieHeader, workspaceId)).toBe(0);
    });

    test(`PATCH rejects an agent from ${name} and keeps the old value`, async () => {
      const { cookieHeader, workspaceId, foreignId } = await setup();
      const ownAgentId = await createAgent(cookieHeader, workspaceId);
      const created = await postTask(cookieHeader, workspaceId, { assignedAgentId: ownAgentId });
      const { task } = taskResponseSchema.parse(await created.json());

      const response = await patchTask(cookieHeader, workspaceId, task.id, {
        assignedAgentId: foreignId,
      });

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      const unchanged = await getTask(cookieHeader, workspaceId, task.id);
      expect(unchanged.assignedAgentId).toBe(ownAgentId);
    });
  }

  test('assigns an agent of the same workspace and clears it again', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);

    const created = await postTask(cookieHeader, workspaceId, { assignedAgentId: agentId });
    expect(created.status).toBe(StatusCodes.CREATED);
    const { task } = taskResponseSchema.parse(await created.json());
    expect(task.assignedAgentId).toBe(agentId);

    const cleared = await patchTask(cookieHeader, workspaceId, task.id, { assignedAgentId: null });
    expect(cleared.status).toBe(StatusCodes.OK);
    expect((await getTask(cookieHeader, workspaceId, task.id)).assignedAgentId).toBeNull();
  });
});

describe('task labelIds stay inside the workspace', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  for (const { name, setup } of foreignLabelCases) {
    test(`POST rejects a label from ${name} and creates nothing`, async () => {
      const { cookieHeader, workspaceId, foreignId } = await setup();

      const response = await postTask(cookieHeader, workspaceId, { labelIds: [foreignId] });

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await listTaskCount(cookieHeader, workspaceId)).toBe(0);
    });

    test(`PATCH rejects a label from ${name} and keeps the old labels`, async () => {
      const { cookieHeader, workspaceId, foreignId } = await setup();
      const ownLabelId = await createLabel(cookieHeader, workspaceId);
      const created = await postTask(cookieHeader, workspaceId, { labelIds: [ownLabelId] });
      const { task } = taskResponseSchema.parse(await created.json());

      const response = await patchTask(cookieHeader, workspaceId, task.id, {
        labelIds: [foreignId],
      });

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      const unchanged = await getTask(cookieHeader, workspaceId, task.id);
      expect(unchanged.labels.map((label) => label.id)).toEqual([ownLabelId]);
    });
  }

  test('attaches labels of the same workspace and clears them again', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const labelId = await createLabel(cookieHeader, workspaceId);

    const created = await postTask(cookieHeader, workspaceId, { labelIds: [labelId] });
    expect(created.status).toBe(StatusCodes.CREATED);
    const { task } = taskResponseSchema.parse(await created.json());
    expect(
      (await getTask(cookieHeader, workspaceId, task.id)).labels.map((label) => label.id),
    ).toEqual([labelId]);

    const cleared = await patchTask(cookieHeader, workspaceId, task.id, { labelIds: [] });
    expect(cleared.status).toBe(StatusCodes.OK);
    expect((await getTask(cookieHeader, workspaceId, task.id)).labels).toEqual([]);
  });
});

describe('task deletes keep working with references', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('deleting an assigned agent clears the assignment', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const agentId = await createAgent(cookieHeader, workspaceId);
    const created = await postTask(cookieHeader, workspaceId, { assignedAgentId: agentId });
    const { task } = taskResponseSchema.parse(await created.json());

    const deleteResponse = await app.request(`/workspace/${workspaceId}/agent/${agentId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(deleteResponse.status).toBe(StatusCodes.OK);
    expect((await getTask(cookieHeader, workspaceId, task.id)).assignedAgentId).toBeNull();
  });

  test('deleting a label detaches it from its tasks', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const labelId = await createLabel(cookieHeader, workspaceId);
    const created = await postTask(cookieHeader, workspaceId, { labelIds: [labelId] });
    const { task } = taskResponseSchema.parse(await created.json());

    const deleteResponse = await app.request(`/workspace/${workspaceId}/task-label/${labelId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(deleteResponse.status).toBe(StatusCodes.OK);
    expect((await getTask(cookieHeader, workspaceId, task.id)).labels).toEqual([]);
  });

  test('deleting a workspace with assigned and labelled tasks succeeds', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    const workspaceId = await createWorkspace(cookieHeader);
    const agentId = await createAgent(cookieHeader, workspaceId);
    const labelId = await createLabel(cookieHeader, workspaceId);
    await postTask(cookieHeader, workspaceId, { assignedAgentId: agentId, labelIds: [labelId] });

    const response = await app.request(`/workspace/${workspaceId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
  });
});

describe('task tools', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('updateTask returns "Agent not found." for an agent of another workspace', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    const foreignAgentId = await createAgent(userB.cookieHeader, userB.workspaceId);
    const created = await postTask(userA.cookieHeader, userA.workspaceId, {});
    const { task } = taskResponseSchema.parse(await created.json());
    const updateTaskTool = getUpdateTaskTool(stubStreamWriter, userA.workspaceId);

    const result = await updateTaskTool.execute?.(
      { id: task.id, assignedAgentId: foreignAgentId },
      { toolCallId: 'call-1', messages: [] },
    );

    expect(result).toEqual({ error: 'Agent not found.' });
    expect(
      (await getTask(userA.cookieHeader, userA.workspaceId, task.id)).assignedAgentId,
    ).toBeNull();
  });
});
