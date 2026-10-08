import { getCreateDocumentTool } from '@repo/ai';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { stubStreamWriter } from '../stub-stream-writer';

// A document may only live in a folder of its own workspace.

const idSchema = z.object({ id: z.string() });
const documentSchema = z.object({ id: z.string(), folderId: z.string().nullable() });
const documentResponseSchema = z.object({ document: documentSchema });

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

async function createFolder(cookieHeader: string, workspaceId: string): Promise<string> {
  const response = await app.request(
    `/workspace/${workspaceId}/folder`,
    jsonRequest(cookieHeader, 'POST', { name: 'Folder' }),
  );
  return z.object({ folder: idSchema }).parse(await response.json()).folder.id;
}

async function createAgent(cookieHeader: string, workspaceId: string): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();
  const response = await app.request(
    `/workspace/${workspaceId}/agent`,
    jsonRequest(cookieHeader, 'POST', { name: 'Agent', aiModelId, systemPrompt: 'Help.' }),
  );
  return z.object({ agent: idSchema }).parse(await response.json()).agent.id;
}

async function postDocument(
  cookieHeader: string,
  workspaceId: string,
  body: Record<string, unknown>,
) {
  return app.request(
    `/workspace/${workspaceId}/document`,
    jsonRequest(cookieHeader, 'POST', { title: 'A document', ...body }),
  );
}

async function getDocument(cookieHeader: string, workspaceId: string, documentId: string) {
  const response = await app.request(`/workspace/${workspaceId}/document/${documentId}`, {
    headers: { cookie: cookieHeader },
  });
  return documentResponseSchema.parse(await response.json()).document;
}

async function countDocuments(cookieHeader: string, workspaceId: string): Promise<number> {
  const response = await app.request(`/workspace/${workspaceId}/document`, {
    headers: { cookie: cookieHeader },
  });
  return z.object({ documents: z.array(idSchema) }).parse(await response.json()).documents.length;
}

interface ForeignFolderCase {
  name: string;
  setup: () => Promise<{ cookieHeader: string; workspaceId: string; foreignFolderId: string }>;
}

const foreignFolderCases: ForeignFolderCase[] = [
  {
    name: 'another user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const userB = await seedAuthenticatedUser();
      const foreignFolderId = await createFolder(userB.cookieHeader, userB.workspaceId);
      return { ...userA, foreignFolderId };
    },
  },
  {
    name: 'another workspace of the same user',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const otherWorkspaceId = await createWorkspace(userA.cookieHeader);
      const foreignFolderId = await createFolder(userA.cookieHeader, otherWorkspaceId);
      return { ...userA, foreignFolderId };
    },
  },
];

describe('document folderId stays inside the workspace', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  for (const { name, setup } of foreignFolderCases) {
    test(`POST rejects a folder from ${name} and creates nothing`, async () => {
      const { cookieHeader, workspaceId, foreignFolderId } = await setup();

      const response = await postDocument(cookieHeader, workspaceId, { folderId: foreignFolderId });

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await countDocuments(cookieHeader, workspaceId)).toBe(0);
    });

    test(`PATCH rejects a folder from ${name} and keeps the old folder`, async () => {
      const { cookieHeader, workspaceId, foreignFolderId } = await setup();
      const ownFolderId = await createFolder(cookieHeader, workspaceId);
      const created = await postDocument(cookieHeader, workspaceId, { folderId: ownFolderId });
      const { document } = documentResponseSchema.parse(await created.json());

      const response = await app.request(
        `/workspace/${workspaceId}/document/${document.id}`,
        jsonRequest(cookieHeader, 'PATCH', { folderId: foreignFolderId }),
      );

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      const unchanged = await getDocument(cookieHeader, workspaceId, document.id);
      expect(unchanged.folderId).toBe(ownFolderId);
    });
  }

  test('files a document into a folder of the same workspace and moves it back to root', async () => {
    const { cookieHeader, workspaceId } = await seedAuthenticatedUser();
    const folderId = await createFolder(cookieHeader, workspaceId);

    const created = await postDocument(cookieHeader, workspaceId, { folderId });
    expect(created.status).toBe(StatusCodes.CREATED);
    const { document } = documentResponseSchema.parse(await created.json());
    expect(document.folderId).toBe(folderId);

    const moved = await app.request(
      `/workspace/${workspaceId}/document/${document.id}`,
      jsonRequest(cookieHeader, 'PATCH', { folderId: null }),
    );
    expect(moved.status).toBe(StatusCodes.OK);
    expect((await getDocument(cookieHeader, workspaceId, document.id)).folderId).toBeNull();
  });
});

describe('document tools', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('createDocument returns "Folder not found." for a folder of another workspace', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    const foreignFolderId = await createFolder(userB.cookieHeader, userB.workspaceId);
    const agentId = await createAgent(userA.cookieHeader, userA.workspaceId);
    const createDocumentTool = getCreateDocumentTool(stubStreamWriter, userA.workspaceId, agentId);

    const result = await createDocumentTool.execute?.(
      { title: 'Notes', content: 'Hello', folderId: foreignFolderId },
      { toolCallId: 'call-1', messages: [] },
    );

    expect(result).toEqual({ error: 'Folder not found.' });
    expect(await countDocuments(userA.cookieHeader, userA.workspaceId)).toBe(0);
  });
});
