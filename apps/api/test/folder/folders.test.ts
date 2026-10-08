import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Plain CRUD for /workspace/:workspaceId/folder.
// Auth/authorization are covered exhaustively in test/auth/;
// this file only checks the folder feature's own behavior.

const folderSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
});

const folderListResponseSchema = z.object({ folders: z.array(folderSchema) });
const folderResponseSchema = z.object({ folder: folderSchema });
const documentSchema = z.object({ id: z.string(), folderId: z.string().nullable() });
const documentResponseSchema = z.object({ document: documentSchema });

async function createFolder(cookieHeader: string, workspaceId: string, name = 'Folder A') {
  const response = await app.request(`/workspace/${workspaceId}/folder`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return folderResponseSchema.parse(await response.json()).folder;
}

describe('GET /workspace/:workspaceId/folder', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/folder`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = folderListResponseSchema.parse(await response.json());
    expect(body.folders).toEqual([]);
  });

  test('only lists folders belonging to the requested workspace', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    await createFolder(userA.cookieHeader, userA.workspaceId, 'Owned by A');
    await createFolder(userB.cookieHeader, userB.workspaceId, 'Owned by B');

    const response = await app.request(`/workspace/${userA.workspaceId}/folder`, {
      headers: { cookie: userA.cookieHeader },
    });

    const body = folderListResponseSchema.parse(await response.json());
    expect(body.folders.map((folder) => folder.name)).toEqual(['Owned by A']);
  });
});

describe('POST /workspace/:workspaceId/folder', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('creates a folder and it shows up in the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const created = await createFolder(cookieHeader, workspaceId, 'Contracts');
    expect(created.name).toBe('Contracts');
    expect(created.workspaceId).toBe(workspaceId);

    const listResponse = await app.request(`/workspace/${workspaceId}/folder`, {
      headers: { cookie: cookieHeader },
    });
    const body = folderListResponseSchema.parse(await listResponse.json());
    expect(body.folders.map((folder) => folder.id)).toEqual([created.id]);
  });

  test('rejects an empty name', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/folder`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('PATCH /workspace/:workspaceId/folder/:folderId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('renames the folder', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await createFolder(cookieHeader, workspaceId, 'Old name');

    const response = await app.request(`/workspace/${workspaceId}/folder/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New name' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = folderResponseSchema.parse(await response.json());
    expect(body.folder.name).toBe('New name');
  });

  test('404s for a folder id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await createFolder(cookieHeader, workspaceId);
    await app.request(`/workspace/${workspaceId}/folder/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/folder/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New name' }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /workspace/:workspaceId/folder/:folderId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('removes the folder from the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await createFolder(cookieHeader, workspaceId);

    const deleteResponse = await app.request(`/workspace/${workspaceId}/folder/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/folder`, {
      headers: { cookie: cookieHeader },
    });
    const body = folderListResponseSchema.parse(await listResponse.json());
    expect(body.folders).toEqual([]);
  });

  test('moves contained documents to root instead of deleting them', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await createFolder(cookieHeader, workspaceId);

    const createDocResponse = await app.request(`/workspace/${workspaceId}/document`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Doc in folder', folderId: created.id }),
    });
    const { document } = documentResponseSchema.parse(await createDocResponse.json());
    expect(document.folderId).toBe(created.id);

    await app.request(`/workspace/${workspaceId}/folder/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const getDocResponse = await app.request(`/workspace/${workspaceId}/document/${document.id}`, {
      headers: { cookie: cookieHeader },
    });
    const { document: survivingDocument } = documentResponseSchema.parse(
      await getDocResponse.json(),
    );
    expect(survivingDocument.folderId).toBeNull();
  });
});
