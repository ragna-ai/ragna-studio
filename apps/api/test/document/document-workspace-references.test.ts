import { documentToolDefinitions, type ToolContext } from '@repo/ai';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  createDocument,
  createFolder,
  foreignWorkspaceCases,
  jsonRequest,
  postDocument,
} from './document-fixtures';

// A document may only live in a folder of its own workspace.

const idSchema = z.object({ id: z.string() });
const documentSchema = z.object({ id: z.string(), folderId: z.string().nullable() });
const documentResponseSchema = z.object({ document: documentSchema });

function toolContext(workspaceId: string): ToolContext {
  return { userId: 'user-1', workspaceId, origin: 'agent' };
}

function findDocumentDefinition(agentId: string, name: string) {
  const definition = documentToolDefinitions({ agentId }).find(
    (candidate) => candidate.name === name,
  );
  if (!definition) {
    throw new Error(`Missing document tool ${name}`);
  }
  return definition;
}

async function createAgent(cookieHeader: string, workspaceId: string): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();
  const response = await app.request(
    `/workspace/${workspaceId}/agent`,
    jsonRequest(cookieHeader, 'POST', { name: 'Agent', aiModelId, systemPrompt: 'Help.' }),
  );
  return z.object({ agent: idSchema }).parse(await response.json()).agent.id;
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

describe('document folderId stays inside the workspace', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  for (const { name, setup } of foreignWorkspaceCases) {
    test(`POST rejects a folder from ${name} and creates nothing`, async () => {
      const { cookieHeader, workspaceId, foreignCookieHeader, foreignWorkspaceId } = await setup();
      const foreignFolderId = await createFolder(foreignCookieHeader, foreignWorkspaceId);

      const response = await postDocument(cookieHeader, workspaceId, { folderId: foreignFolderId });

      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await countDocuments(cookieHeader, workspaceId)).toBe(0);
    });

    test(`PATCH rejects a folder from ${name} and keeps the old folder`, async () => {
      const { cookieHeader, workspaceId, foreignCookieHeader, foreignWorkspaceId } = await setup();
      const foreignFolderId = await createFolder(foreignCookieHeader, foreignWorkspaceId);
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

  test('createDocument fails with not_found for a folder of another workspace', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    const foreignFolderId = await createFolder(userB.cookieHeader, userB.workspaceId);
    const agentId = await createAgent(userA.cookieHeader, userA.workspaceId);
    const createDocumentTool = findDocumentDefinition(agentId, 'createDocument');

    const result = await createDocumentTool.execute(
      { title: 'Notes', content: 'Hello', folderId: foreignFolderId },
      toolContext(userA.workspaceId),
    );

    expect(result).toEqual({ status: 'not_found', message: 'Folder not found.' });
    expect(await countDocuments(userA.cookieHeader, userA.workspaceId)).toBe(0);
  });

  test('readDocument fails with not_found for a document of another workspace', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    const foreignDocumentId = await createDocument(userB.cookieHeader, userB.workspaceId);
    const readDocumentTool = findDocumentDefinition('agent-1', 'readDocument');

    const result = await readDocumentTool.execute(
      { documentId: foreignDocumentId },
      toolContext(userA.workspaceId),
    );

    expect(result).toEqual({ status: 'not_found', message: 'Document not found.' });
  });

  test('editDocument fails with not_found for a document of another workspace and changes nothing', async () => {
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();
    const foreignDocumentId = await createDocument(userB.cookieHeader, userB.workspaceId);
    const editDocumentTool = findDocumentDefinition('agent-1', 'editDocument');

    const result = await editDocumentTool.execute(
      { documentId: foreignDocumentId, action: 'append', text: 'Injected' },
      toolContext(userA.workspaceId),
    );

    expect(result).toEqual({ status: 'not_found', message: 'Document not found.' });
    const unchanged = await app.request(
      `/workspace/${userB.workspaceId}/document/${foreignDocumentId}`,
      { headers: { cookie: userB.cookieHeader } },
    );
    const body = z
      .object({ document: z.object({ content: z.string() }) })
      .parse(await unchanged.json());
    expect(body.document.content).toBe('');
  });
});
