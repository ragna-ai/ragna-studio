import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Plain CRUD + the documented business rules for
// /workspace/:workspaceId/task (docs/testing/strategy.md, priority 3;
// docs/tasks/prd.md). Auth/authorization are covered exhaustively in
// test/auth/; this file only checks the task feature's own behavior.

const taskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  number: z.number(),
  title: z.string(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']),
  priority: z.enum(['none', 'urgent', 'high', 'medium', 'low']),
  parentTaskId: z.string().nullable(),
  dueDate: z.string().nullable(),
  remindDaysBeforeDue: z.number().nullable(),
});

const taskListResponseSchema = z.object({ tasks: z.array(taskSchema) });
const taskResponseSchema = z.object({ task: taskSchema });

async function createTask(
  cookieHeader: string,
  workspaceId: string,
  body: Record<string, unknown> = { title: 'A task' },
) {
  const response = await app.request(`/workspace/${workspaceId}/task`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, task: taskResponseSchema.parse(await response.json()).task };
}

describe('GET /workspace/:workspaceId/task', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/task`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = taskListResponseSchema.parse(await response.json());
    expect(body.tasks).toEqual([]);
  });

  test('filters by status and priority', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await createTask(cookieHeader, workspaceId, { title: 'Backlog low', status: 'backlog', priority: 'low' });
    await createTask(cookieHeader, workspaceId, { title: 'Todo urgent', status: 'todo', priority: 'urgent' });

    const response = await app.request(`/workspace/${workspaceId}/task?status=backlog`, {
      headers: { cookie: cookieHeader },
    });
    const body = taskListResponseSchema.parse(await response.json());
    expect(body.tasks.map((task) => task.title)).toEqual(['Backlog low']);

    const priorityResponse = await app.request(
      `/workspace/${workspaceId}/task?priority=urgent`,
      { headers: { cookie: cookieHeader } },
    );
    const priorityBody = taskListResponseSchema.parse(await priorityResponse.json());
    expect(priorityBody.tasks.map((task) => task.title)).toEqual(['Todo urgent']);
  });
});

describe('POST /workspace/:workspaceId/task', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('creates a task with defaulted status and priority', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const { status, task } = await createTask(cookieHeader, workspaceId, { title: 'Ship the release' });

    expect(status).toBe(StatusCodes.CREATED);
    expect(task.title).toBe('Ship the release');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('none');
    expect(task.workspaceId).toBe(workspaceId);
  });

  test('rejects remindDaysBeforeDue without a dueDate', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/task`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Needs a due date', remindDaysBeforeDue: 1 }),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('rejects a subtask of a subtask (one level deep)', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { task: parent } = await createTask(cookieHeader, workspaceId, { title: 'Parent' });
    const { task: child } = await createTask(cookieHeader, workspaceId, {
      title: 'Child',
      parentTaskId: parent.id,
    });

    const response = await app.request(`/workspace/${workspaceId}/task`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Grandchild', parentTaskId: child.id }),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});

describe('GET /workspace/:workspaceId/task/:taskId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('404s for a task id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { task } = await createTask(cookieHeader, workspaceId);
    await app.request(`/workspace/${workspaceId}/task/${task.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/task/${task.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('PATCH /workspace/:workspaceId/task/:taskId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('applies a partial update', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { task } = await createTask(cookieHeader, workspaceId, { title: 'Original', priority: 'low' });

    const response = await app.request(`/workspace/${workspaceId}/task/${task.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ priority: 'high' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = taskResponseSchema.parse(await response.json());
    expect(body.task.priority).toBe('high');
    expect(body.task.title).toBe('Original');
  });
});

describe('DELETE /workspace/:workspaceId/task/:taskId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('deleting a parent leaves its subtask as top-level', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { task: parent } = await createTask(cookieHeader, workspaceId, { title: 'Parent' });
    const { task: child } = await createTask(cookieHeader, workspaceId, {
      title: 'Child',
      parentTaskId: parent.id,
    });

    const deleteResponse = await app.request(`/workspace/${workspaceId}/task/${parent.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const getChildResponse = await app.request(`/workspace/${workspaceId}/task/${child.id}`, {
      headers: { cookie: cookieHeader },
    });
    const body = taskResponseSchema.parse(await getChildResponse.json());
    expect(body.task.parentTaskId).toBeNull();
  });
});

describe('POST /workspace/:workspaceId/task/:taskId/move', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('moves a task into a different status column', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { task } = await createTask(cookieHeader, workspaceId, { title: 'Move me', status: 'todo' });

    const response = await app.request(`/workspace/${workspaceId}/task/${task.id}/move`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = taskResponseSchema.parse(await response.json());
    expect(body.task.status).toBe('in_progress');
  });
});
