import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Plain CRUD for /workspace/:workspaceId/task-label (docs/testing/
// strategy.md, priority 3). Auth/authorization are covered exhaustively in
// test/auth/; this file only checks the task-label feature's own behavior.

const taskLabelSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  color: z.string(),
});

const taskLabelListResponseSchema = z.object({ taskLabels: z.array(taskLabelSchema) });
const taskLabelResponseSchema = z.object({ taskLabel: taskLabelSchema });

async function createTaskLabel(cookieHeader: string, workspaceId: string, name = 'Bug', color = '#ff0000') {
  const response = await app.request(`/workspace/${workspaceId}/task-label`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
  return taskLabelResponseSchema.parse(await response.json()).taskLabel;
}

describe('GET /workspace/:workspaceId/task-label', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/task-label`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = taskLabelListResponseSchema.parse(await response.json());
    expect(body.taskLabels).toEqual([]);
  });
});

describe('POST /workspace/:workspaceId/task-label', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('creates a label and it shows up in the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const created = await createTaskLabel(cookieHeader, workspaceId, 'Bug', '#ff0000');
    expect(created.name).toBe('Bug');
    expect(created.color).toBe('#ff0000');

    const listResponse = await app.request(`/workspace/${workspaceId}/task-label`, {
      headers: { cookie: cookieHeader },
    });
    const body = taskLabelListResponseSchema.parse(await listResponse.json());
    expect(body.taskLabels.map((label) => label.id)).toEqual([created.id]);
  });

  test('rejects a color that is not a hex string', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/task-label`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bug', color: 'red' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('PATCH /workspace/:workspaceId/task-label/:taskLabelId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('updates name and color', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await createTaskLabel(cookieHeader, workspaceId);

    const response = await app.request(`/workspace/${workspaceId}/task-label/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Feature', color: '#00ff00' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = taskLabelResponseSchema.parse(await response.json());
    expect(body.taskLabel.name).toBe('Feature');
    expect(body.taskLabel.color).toBe('#00ff00');
  });
});

describe('DELETE /workspace/:workspaceId/task-label/:taskLabelId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('removes the label from the list without touching tasks', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await createTaskLabel(cookieHeader, workspaceId);

    const createTaskResponse = await app.request(`/workspace/${workspaceId}/task`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Labeled task', labelIds: [created.id] }),
    });
    const { task } = z
      .object({ task: z.object({ id: z.string() }) })
      .parse(await createTaskResponse.json());

    const deleteResponse = await app.request(
      `/workspace/${workspaceId}/task-label/${created.id}`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/task-label`, {
      headers: { cookie: cookieHeader },
    });
    const body = taskLabelListResponseSchema.parse(await listResponse.json());
    expect(body.taskLabels).toEqual([]);

    const getTaskResponse = await app.request(`/workspace/${workspaceId}/task/${task.id}`, {
      headers: { cookie: cookieHeader },
    });
    expect(getTaskResponse.status).toBe(StatusCodes.OK);
  });
});
