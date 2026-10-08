import {
  resetProviderMocks,
  seedAuthenticatedUser,
  seedTokenPricedAiModel,
  truncateAllTables,
  uploadObjectBufferMock,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// agent-context-document (specs/testing/strategy.md's "Blocked on mock
// infrastructure", now unblocked). Auth/authorization are covered
// exhaustively in test/auth/ and test/workspace/workspace-authorization.
// test.ts; this file only checks the feature's own behavior. Every route
// goes through the faked storage upload (@repo/testing's
// storage-provider.mock.ts); no `ai` mock is needed, extraction itself is
// a worker concern
// (apps/worker/src/processors/agent-context-document.processor.ts), out
// of scope here.

const documentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  isTruncated: z.boolean(),
  errorMessage: z.string().nullable(),
});

const documentResponseSchema = z.object({ document: documentSchema });
const documentListResponseSchema = z.object({ documents: z.array(documentSchema) });

async function createAgent(cookieHeader: string, workspaceId: string, aiModelId: string) {
  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Support bot',
      aiModelId,
      systemPrompt: 'You are helpful.',
    }),
  });
  const body = z.object({ agent: z.object({ id: z.string() }) }).parse(await response.json());
  return body.agent;
}

function textFile(name: string, content = 'Some agent context.') {
  return new File([content], name, { type: 'text/plain' });
}

function csvFile(name: string, content = 'name,age\nAda,36\n') {
  return new File([content], name, { type: 'text/csv' });
}

async function seedAgent() {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const { aiModelId } = await seedTokenPricedAiModel();
  const agent = await createAgent(cookieHeader, workspaceId, aiModelId);
  return { userId, workspaceId, cookieHeader, agentId: agent.id };
}

async function uploadDocument(
  cookieHeader: string,
  workspaceId: string,
  agentId: string,
  file: File,
) {
  const formData = new FormData();
  formData.append('files', file);

  const response = await app.request(
    `/workspace/${workspaceId}/agent/${agentId}/context-document`,
    { method: 'POST', headers: { cookie: cookieHeader }, body: formData },
  );
  const json = await response.json();
  return {
    status: response.status,
    // A rejected upload (e.g. an unsniffable file type) returns the plain
    // error envelope, not `{ documents }`, so this only validates the
    // shape on success; callers asserting a rejection just check `status`.
    documents: response.ok ? documentListResponseSchema.parse(json).documents : [],
  };
}

describe('GET /workspace/:workspaceId/agent/:agentId/context-document', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const { workspaceId, agentId } = await seedAgent();

    const response = await app.request(
      `/workspace/${workspaceId}/agent/${agentId}/context-document`,
    );

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('starts empty for a new agent', async () => {
    const { workspaceId, agentId, cookieHeader } = await seedAgent();

    const response = await app.request(
      `/workspace/${workspaceId}/agent/${agentId}/context-document`,
      { headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = documentListResponseSchema.parse(await response.json());
    expect(body.documents).toEqual([]);
  });
});

describe('POST /workspace/:workspaceId/agent/:agentId/context-document', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('uploads a document through the faked storage client and it shows up pending', async () => {
    const { workspaceId, agentId, cookieHeader } = await seedAgent();

    const { status, documents } = await uploadDocument(
      cookieHeader,
      workspaceId,
      agentId,
      textFile('notes.txt'),
    );

    expect(status).toBe(StatusCodes.CREATED);
    expect(documents).toHaveLength(1);
    expect(documents[0]?.name).toBe('notes.txt');
    expect(documents[0]?.status).toBe('pending');
    expect(uploadObjectBufferMock).toHaveBeenCalledTimes(1);

    const listResponse = await app.request(
      `/workspace/${workspaceId}/agent/${agentId}/context-document`,
      { headers: { cookie: cookieHeader } },
    );
    const listBody = documentListResponseSchema.parse(await listResponse.json());
    expect(listBody.documents.map((document) => document.id)).toEqual([documents[0]?.id]);
  });

  test('rejects a file type it cannot sniff', async () => {
    const { workspaceId, agentId, cookieHeader } = await seedAgent();

    const { status } = await uploadDocument(
      cookieHeader,
      workspaceId,
      agentId,
      new File([new Uint8Array([1, 2, 3, 4])], 'mystery.bin', {
        type: 'application/octet-stream',
      }),
    );

    expect(status).toBe(StatusCodes.BAD_REQUEST);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });

  // Agent context documents now accept every DOCUMENT_KINDS entry, not just
  // pdf/docx/txt/md (unified-media-prd.md, decision 6): a csv that the old,
  // narrower sniffAgentContextDocumentKind would have rejected must now be
  // accepted.
  test('accepts a csv, widened from DOCUMENT_KINDS (unified-media-prd.md decision 6)', async () => {
    const { workspaceId, agentId, cookieHeader } = await seedAgent();

    const { status, documents } = await uploadDocument(
      cookieHeader,
      workspaceId,
      agentId,
      csvFile('rows.csv'),
    );

    expect(status).toBe(StatusCodes.CREATED);
    expect(documents).toHaveLength(1);
    expect(documents[0]?.name).toBe('rows.csv');
    expect(documents[0]?.mimeType).toBe('text/csv');
    expect(uploadObjectBufferMock).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /workspace/:workspaceId/agent/:agentId/context-document/:documentId', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('renames a document', async () => {
    const { workspaceId, agentId, cookieHeader } = await seedAgent();
    const { documents } = await uploadDocument(
      cookieHeader,
      workspaceId,
      agentId,
      textFile('notes.txt'),
    );
    const documentId = documents[0]?.id;

    const response = await app.request(
      `/workspace/${workspaceId}/agent/${agentId}/context-document/${documentId}`,
      {
        method: 'PATCH',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'renamed.txt' }),
      },
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = documentResponseSchema.parse(await response.json());
    expect(body.document.name).toBe('renamed.txt');
  });

  test('404s for a document id that does not exist', async () => {
    const { workspaceId, agentId, cookieHeader } = await seedAgent();

    const response = await app.request(
      `/workspace/${workspaceId}/agent/${agentId}/context-document/019fb2d8-0000-7000-8000-000000000000`,
      {
        method: 'PATCH',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'renamed.txt' }),
      },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('POST /workspace/:workspaceId/agent/:agentId/context-document/:documentId/retry', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects retrying a document that has not failed', async () => {
    const { workspaceId, agentId, cookieHeader } = await seedAgent();
    const { documents } = await uploadDocument(
      cookieHeader,
      workspaceId,
      agentId,
      textFile('notes.txt'),
    );
    const documentId = documents[0]?.id;

    const response = await app.request(
      `/workspace/${workspaceId}/agent/${agentId}/context-document/${documentId}/retry`,
      { method: 'POST', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});

describe('DELETE /workspace/:workspaceId/agent/:agentId/context-document/:documentId', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('removes the document from the list', async () => {
    const { workspaceId, agentId, cookieHeader } = await seedAgent();
    const { documents } = await uploadDocument(
      cookieHeader,
      workspaceId,
      agentId,
      textFile('notes.txt'),
    );
    const documentId = documents[0]?.id;

    const deleteResponse = await app.request(
      `/workspace/${workspaceId}/agent/${agentId}/context-document/${documentId}`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(
      `/workspace/${workspaceId}/agent/${agentId}/context-document`,
      { headers: { cookie: cookieHeader } },
    );
    const listBody = documentListResponseSchema.parse(await listResponse.json());
    expect(listBody.documents).toEqual([]);
  });
});
