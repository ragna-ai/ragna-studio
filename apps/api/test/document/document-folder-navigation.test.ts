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
} from './document-fixtures';

const documentListSchema = z.object({ documents: z.array(z.object({ id: z.string() })) });

async function listDocumentIds(
  cookieHeader: string,
  workspaceId: string,
  folderId?: string,
): Promise<string[]> {
  const query = folderId === undefined ? '' : `?folderId=${folderId}`;
  const response = await app.request(
    `/workspace/${workspaceId}/document${query}`,
    getRequest(cookieHeader),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return documentListSchema.parse(await response.json()).documents.map((d) => d.id);
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('GET /workspace/:workspaceId/document folder filter', () => {
  async function seedFilingFixture() {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const folderId = await createFolder(cookieHeader, workspaceId);
    const filed = await createDocument(cookieHeader, workspaceId, { folderId });
    const unfiled = await createDocument(cookieHeader, workspaceId);
    return { workspaceId, cookieHeader, folderId, filed, unfiled };
  }

  test('without the param lists every document', async () => {
    const { workspaceId, cookieHeader, filed, unfiled } = await seedFilingFixture();

    const ids = await listDocumentIds(cookieHeader, workspaceId);

    expect(ids.toSorted()).toEqual([filed, unfiled].toSorted());
  });

  test('folderId=root lists only documents in no folder', async () => {
    const { workspaceId, cookieHeader, unfiled } = await seedFilingFixture();

    expect(await listDocumentIds(cookieHeader, workspaceId, 'root')).toEqual([unfiled]);
  });

  test('folderId=<id> lists only the documents of that folder', async () => {
    const { workspaceId, cookieHeader, folderId, filed } = await seedFilingFixture();

    expect(await listDocumentIds(cookieHeader, workspaceId, folderId)).toEqual([filed]);
  });

  test('answers 404 for a folder id that does not exist', async () => {
    const { workspaceId, cookieHeader, folderId } = await seedFilingFixture();
    await app.request(`/workspace/${workspaceId}/folder/${folderId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(
      `/workspace/${workspaceId}/document?folderId=${folderId}`,
      getRequest(cookieHeader),
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('moving a document changes the filtered lists', async () => {
    const { workspaceId, cookieHeader, folderId, filed } = await seedFilingFixture();
    const otherFolderId = await createFolder(cookieHeader, workspaceId, 'Other');

    await app.request(
      `/workspace/${workspaceId}/document/${filed}`,
      jsonRequest(cookieHeader, 'PATCH', { folderId: otherFolderId }),
    );
    expect(await listDocumentIds(cookieHeader, workspaceId, folderId)).toEqual([]);
    expect(await listDocumentIds(cookieHeader, workspaceId, otherFolderId)).toEqual([filed]);

    await app.request(
      `/workspace/${workspaceId}/document/${filed}`,
      jsonRequest(cookieHeader, 'PATCH', { folderId: null }),
    );
    expect(await listDocumentIds(cookieHeader, workspaceId, 'root')).toContain(filed);
    expect(await listDocumentIds(cookieHeader, workspaceId, otherFolderId)).toEqual([]);
  });
});

describe('workspace boundary for documents', () => {
  for (const { name, setup } of inaccessibleWorkspaceCases) {
    test(`answers 404 for the document list of ${name}`, async () => {
      const { cookieHeader, workspaceId, ownerCookieHeader } = await setup();
      const folderId = await createFolder(ownerCookieHeader, workspaceId);

      for (const query of ['', '?folderId=root', `?folderId=${folderId}`]) {
        const response = await app.request(
          `/workspace/${workspaceId}/document${query}`,
          getRequest(cookieHeader),
        );
        expect(response.status).toBe(StatusCodes.NOT_FOUND);
      }
    });
  }

  for (const { name, setup } of foreignWorkspaceCases) {
    describe(`with ${name}`, () => {
      test('the document list answers 404 for a folder of workspace B', async () => {
        const { cookieHeader, workspaceId, foreignCookieHeader, foreignWorkspaceId } =
          await setup();
        const folderId = await createFolder(foreignCookieHeader, foreignWorkspaceId);

        const response = await app.request(
          `/workspace/${workspaceId}/document?folderId=${folderId}`,
          getRequest(cookieHeader),
        );

        expect(response.status).toBe(StatusCodes.NOT_FOUND);
      });

      test('a document of workspace B cannot be read through workspace A', async () => {
        const { cookieHeader, workspaceId, foreignCookieHeader, foreignWorkspaceId } =
          await setup();
        const documentId = await createDocument(foreignCookieHeader, foreignWorkspaceId);

        const response = await app.request(
          `/workspace/${workspaceId}/document/${documentId}`,
          getRequest(cookieHeader),
        );

        expect(response.status).toBe(StatusCodes.NOT_FOUND);
      });

      test('a document of workspace B cannot be changed through workspace A', async () => {
        const { cookieHeader, workspaceId, foreignCookieHeader, foreignWorkspaceId } =
          await setup();
        const ownFolderId = await createFolder(cookieHeader, workspaceId);
        const documentId = await createDocument(foreignCookieHeader, foreignWorkspaceId, {
          title: 'Original',
        });

        const titleResponse = await app.request(
          `/workspace/${workspaceId}/document/${documentId}`,
          jsonRequest(cookieHeader, 'PATCH', { title: 'Changed' }),
        );
        const moveResponse = await app.request(
          `/workspace/${workspaceId}/document/${documentId}`,
          jsonRequest(cookieHeader, 'PATCH', { folderId: ownFolderId }),
        );

        expect(titleResponse.status).toBe(StatusCodes.NOT_FOUND);
        expect(moveResponse.status).toBe(StatusCodes.NOT_FOUND);
        const unchanged = await app.request(
          `/workspace/${foreignWorkspaceId}/document/${documentId}`,
          getRequest(foreignCookieHeader),
        );
        const body = z
          .object({ document: z.object({ title: z.string(), folderId: z.string().nullable() }) })
          .parse(await unchanged.json());
        expect(body.document).toEqual({ title: 'Original', folderId: null });
      });

      test('a document of workspace B cannot be deleted through workspace A', async () => {
        const { cookieHeader, workspaceId, foreignCookieHeader, foreignWorkspaceId } =
          await setup();
        const documentId = await createDocument(foreignCookieHeader, foreignWorkspaceId);

        const response = await app.request(`/workspace/${workspaceId}/document/${documentId}`, {
          method: 'DELETE',
          headers: { cookie: cookieHeader },
        });

        expect(response.status).toBe(StatusCodes.NOT_FOUND);
        expect(await listDocumentIds(foreignCookieHeader, foreignWorkspaceId)).toEqual([
          documentId,
        ]);
      });
    });
  }
});
