import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Plain CRUD for /workspace (docs/testing/strategy.md, priority 3). This
// controller checks ownership itself via `ownerId` (see workspace.repo.ts),
// not the shared workspaceGuard middleware: it manages the resource
// workspaceGuard exists to gate, so there's no workspaceId route param to
// guard yet at create time. Auth (missing/invalid session) is covered
// exhaustively in test/auth/; this file only checks the workspace feature's
// own behavior.

const workspaceSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
});

const workspaceListResponseSchema = z.object({ workspaces: z.array(workspaceSchema) });
const workspaceResponseSchema = z.object({ workspace: workspaceSchema });

async function createWorkspace(cookieHeader: string, name = 'Marketing') {
  const response = await app.request('/workspace', {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return workspaceResponseSchema.parse(await response.json()).workspace;
}

describe('GET /workspace', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('a fresh user already has their personal workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/workspace', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = workspaceListResponseSchema.parse(await response.json());
    expect(body.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId]);
    expect(body.workspaces[0]?.name).toBe('Personal');
  });

  test('only lists workspaces owned by the requesting user', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    await createWorkspace(userA.cookieHeader, 'A extra workspace');

    const response = await app.request('/workspace', {
      headers: { cookie: userA.cookieHeader },
    });

    const body = workspaceListResponseSchema.parse(await response.json());
    expect(body.workspaces).toHaveLength(2);
    expect(body.workspaces.some((workspace) => workspace.ownerId === userB.userId)).toBe(false);
  });
});

describe('POST /workspace', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('creates a workspace and it shows up in the list', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const created = await createWorkspace(cookieHeader, 'Marketing');
    expect(created.name).toBe('Marketing');

    const listResponse = await app.request('/workspace', {
      headers: { cookie: cookieHeader },
    });
    const body = workspaceListResponseSchema.parse(await listResponse.json());
    expect(body.workspaces.map((workspace) => workspace.id)).toContain(created.id);
  });

  test('rejects an empty name', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/workspace', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('PATCH /workspace/:workspaceId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('renames the workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = workspaceResponseSchema.parse(await response.json());
    expect(body.workspace.name).toBe('Renamed');
  });

  test('404s for a workspace id that does not exist', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    const created = await createWorkspace(cookieHeader);
    await app.request(`/workspace/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ghost' }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test("404s renaming another user's workspace", async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${userB.workspaceId}`, {
      method: 'PATCH',
      headers: { cookie: userA.cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Hijacked' }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /workspace/:workspaceId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('deletes an extra workspace, cascading its resources', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    const created = await createWorkspace(cookieHeader);
    await app.request(`/workspace/${created.id}/folder`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Folder in doomed workspace' }),
    });

    const deleteResponse = await app.request(`/workspace/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request('/workspace', {
      headers: { cookie: cookieHeader },
    });
    const body = workspaceListResponseSchema.parse(await listResponse.json());
    expect(body.workspaces.map((workspace) => workspace.id)).not.toContain(created.id);
  });

  test('rejects deleting the only remaining workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);

    const listResponse = await app.request('/workspace', {
      headers: { cookie: cookieHeader },
    });
    const body = workspaceListResponseSchema.parse(await listResponse.json());
    expect(body.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId]);
  });

  test("404s deleting another user's workspace, and leaves it untouched", async () => {
    const userA = await seedAuthenticatedUser();
    await createWorkspace(userA.cookieHeader); // so userA has >1, past the "only workspace" guard
    const userB = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${userB.workspaceId}`, {
      method: 'DELETE',
      headers: { cookie: userA.cookieHeader },
    });
    expect(response.status).toBe(StatusCodes.NOT_FOUND);

    const userBListResponse = await app.request('/workspace', {
      headers: { cookie: userB.cookieHeader },
    });
    const body = workspaceListResponseSchema.parse(await userBListResponse.json());
    expect(body.workspaces.map((workspace) => workspace.id)).toContain(userB.workspaceId);
  });
});
