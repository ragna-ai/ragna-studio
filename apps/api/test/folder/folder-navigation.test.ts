import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  createDocument,
  createFolder,
  foreignWorkspaceCases,
  getRequest,
  inaccessibleWorkspaceCases,
  jsonRequest,
} from '../document/document-fixtures';

const folderWithCountSchema = z.strictObject({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  documentCount: z.number(),
});
const folderListResponseSchema = z.strictObject({ folders: z.array(folderWithCountSchema) });
const folderResponseSchema = z.strictObject({ folder: folderWithCountSchema });

beforeEach(async () => {
  await truncateAllTables();
});

describe('folder document counts', () => {
  test('the list carries the number of documents per folder, zero when empty', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const full = await createFolder(cookieHeader, workspaceId, 'Full');
    const empty = await createFolder(cookieHeader, workspaceId, 'Empty');
    await createDocument(cookieHeader, workspaceId, { folderId: full });
    await createDocument(cookieHeader, workspaceId, { folderId: full });
    await createDocument(cookieHeader, workspaceId);

    const response = await app.request(
      `/workspace/${workspaceId}/folder`,
      getRequest(cookieHeader),
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = folderListResponseSchema.parse(await response.json());
    const countById = Object.fromEntries(body.folders.map((f) => [f.id, f.documentCount]));
    expect(countById).toEqual({ [full]: 2, [empty]: 0 });
  });

  test('counts only documents of the folder own workspace', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    const folderId = await createFolder(userA.cookieHeader, userA.workspaceId);
    await createDocument(userB.cookieHeader, userB.workspaceId);

    const response = await app.request(
      `/workspace/${userA.workspaceId}/folder`,
      getRequest(userA.cookieHeader),
    );

    const body = folderListResponseSchema.parse(await response.json());
    expect(body.folders.find((f) => f.id === folderId)?.documentCount).toBe(0);
  });

  test('moving a document updates both folder counts', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const source = await createFolder(cookieHeader, workspaceId, 'Source');
    const target = await createFolder(cookieHeader, workspaceId, 'Target');
    const documentId = await createDocument(cookieHeader, workspaceId, { folderId: source });

    await app.request(
      `/workspace/${workspaceId}/document/${documentId}`,
      jsonRequest(cookieHeader, 'PATCH', { folderId: target }),
    );

    const response = await app.request(
      `/workspace/${workspaceId}/folder`,
      getRequest(cookieHeader),
    );
    const body = folderListResponseSchema.parse(await response.json());
    const countById = Object.fromEntries(body.folders.map((f) => [f.id, f.documentCount]));
    expect(countById).toEqual({ [source]: 0, [target]: 1 });
  });
});

describe('GET /workspace/:workspaceId/folder/:folderId', () => {
  test('returns the folder with its document count', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const folderId = await createFolder(cookieHeader, workspaceId, 'Contracts');
    await createDocument(cookieHeader, workspaceId, { folderId });

    const response = await app.request(
      `/workspace/${workspaceId}/folder/${folderId}`,
      getRequest(cookieHeader),
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = folderResponseSchema.parse(await response.json());
    expect(body.folder.name).toBe('Contracts');
    expect(body.folder.documentCount).toBe(1);
  });

  test('answers 404 for a deleted folder', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const folderId = await createFolder(cookieHeader, workspaceId);
    await app.request(`/workspace/${workspaceId}/folder/${folderId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(
      `/workspace/${workspaceId}/folder/${folderId}`,
      getRequest(cookieHeader),
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('folder names', () => {
  test('rejects renaming to an empty name', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const folderId = await createFolder(cookieHeader, workspaceId, 'Keep');

    const response = await app.request(
      `/workspace/${workspaceId}/folder/${folderId}`,
      jsonRequest(cookieHeader, 'PATCH', { name: '' }),
    );

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    const unchanged = await app.request(
      `/workspace/${workspaceId}/folder/${folderId}`,
      getRequest(cookieHeader),
    );
    expect(folderResponseSchema.parse(await unchanged.json()).folder.name).toBe('Keep');
  });

  test('two folders may share a name', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const first = await createFolder(cookieHeader, workspaceId, 'Same');
    const second = await createFolder(cookieHeader, workspaceId, 'Same');

    expect(first).not.toBe(second);
  });
});

describe('workspace boundary for folders', () => {
  for (const { name, setup } of inaccessibleWorkspaceCases) {
    test(`answers 404 for the folder list and one folder of ${name}`, async () => {
      const { cookieHeader, workspaceId, ownerCookieHeader } = await setup();
      const folderId = await createFolder(ownerCookieHeader, workspaceId);

      const list = await app.request(`/workspace/${workspaceId}/folder`, getRequest(cookieHeader));
      const single = await app.request(
        `/workspace/${workspaceId}/folder/${folderId}`,
        getRequest(cookieHeader),
      );

      expect(list.status).toBe(StatusCodes.NOT_FOUND);
      expect(single.status).toBe(StatusCodes.NOT_FOUND);
    });
  }

  for (const { name, setup } of foreignWorkspaceCases) {
    describe(`folder of ${name}`, () => {
      test('cannot be opened through workspace A', async () => {
        const { cookieHeader, workspaceId, foreignCookieHeader, foreignWorkspaceId } =
          await setup();
        const folderId = await createFolder(foreignCookieHeader, foreignWorkspaceId);

        const response = await app.request(
          `/workspace/${workspaceId}/folder/${folderId}`,
          getRequest(cookieHeader),
        );

        expect(response.status).toBe(StatusCodes.NOT_FOUND);
      });

      test('cannot be renamed through workspace A', async () => {
        const { cookieHeader, workspaceId, foreignCookieHeader, foreignWorkspaceId } =
          await setup();
        const folderId = await createFolder(foreignCookieHeader, foreignWorkspaceId, 'Original');

        const response = await app.request(
          `/workspace/${workspaceId}/folder/${folderId}`,
          jsonRequest(cookieHeader, 'PATCH', { name: 'Changed' }),
        );

        expect(response.status).toBe(StatusCodes.NOT_FOUND);
        const unchanged = await app.request(
          `/workspace/${foreignWorkspaceId}/folder/${folderId}`,
          getRequest(foreignCookieHeader),
        );
        expect(folderResponseSchema.parse(await unchanged.json()).folder.name).toBe('Original');
      });

      test('cannot be deleted through workspace A', async () => {
        const { cookieHeader, workspaceId, foreignCookieHeader, foreignWorkspaceId } =
          await setup();
        const folderId = await createFolder(foreignCookieHeader, foreignWorkspaceId);

        const response = await app.request(`/workspace/${workspaceId}/folder/${folderId}`, {
          method: 'DELETE',
          headers: { cookie: cookieHeader },
        });

        expect(response.status).toBe(StatusCodes.NOT_FOUND);
        const stillThere = await app.request(
          `/workspace/${foreignWorkspaceId}/folder/${folderId}`,
          getRequest(foreignCookieHeader),
        );
        expect(stillThere.status).toBe(StatusCodes.OK);
      });
    });
  }
});
