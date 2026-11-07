import type { Agent } from '@repo/database';
import { buildAgentToolset, type AgentToolGrant, type ToolSet } from '@repo/ai';
import {
  DRIVE_CREATED_FILE_ID,
  DRIVE_DOC,
  DRIVE_FOLDER,
  DRIVE_FORM,
  DRIVE_IMAGE,
  DRIVE_LARGE_FILE,
  DRIVE_MISSING_ID,
  DRIVE_NOTES,
  DRIVE_PDF,
  DRIVE_PDF_TEXT,
  DRIVE_READ_ONLY_FILE,
  DRIVE_SEARCH_QUERY,
  DRIVE_SHARED_FILE,
  DRIVE_SHEET,
  expireConnectionAccessToken,
  failVendorEndpoint,
  GOOGLE_DRIVE_ENDPOINTS,
  GOOGLE_DRIVE_RATE_LIMIT_BODY,
  overrideVendorRoute,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedGoogleDriveConnection,
  seedIntegrationConnection,
  truncateAllTables,
  vendorHttp,
  vendorRequestsTo,
  vendorRoute,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { stubToolExecutionOptions } from '../stub-tool-execution-options';

// The Google Drive HTTP API is faked, so the real adapter, parsing and error mapping run.

const READ_TOOL_NAMES = ['googleDriveListFolder', 'googleDriveReadFile', 'googleDriveSearch'];
const WRITE_TOOL_NAMES = ['googleDriveCreateFile', 'googleDriveUpdateFile'];
const cursorSchema = z.object({ nextCursor: z.string() });
const textSchema = z.object({ text: z.string() });
const DRIVE_READ_GRANT: AgentToolGrant = { id: 'google-drive', access: 'read' };
const DRIVE_WRITE_GRANT: AgentToolGrant = { id: 'google-drive', access: 'write' };
const NO_WAIT_HEADERS = { 'Retry-After': '0' };

function toolsFor(userId: string, toolGrants: Agent['toolGrants']): ToolSet {
  return buildAgentToolset(toolGrants, {
    userId,
    agentId: 'agent-1',
    workspaceId: 'workspace-1',
  });
}

async function callTool(tools: ToolSet, name: string, input: Record<string, unknown>) {
  const execute = tools[name]?.execute;
  if (!execute) throw new Error(`Tool ${name} is not offered`);
  return execute(input, stubToolExecutionOptions);
}

async function connectedReader() {
  const { userId } = await seedAuthenticatedUser();
  await seedGoogleDriveConnection({ userId });
  return toolsFor(userId, [DRIVE_READ_GRANT]);
}

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
});

describe('cloud drive tools: what an agent is offered', () => {
  test('offers nothing when the agent has no drive switched on', async () => {
    const { userId } = await seedAuthenticatedUser();

    expect(Object.keys(toolsFor(userId, []))).toEqual([]);
  });

  test('offers exactly the read tools at the read level', async () => {
    const { userId } = await seedAuthenticatedUser();

    const names = Object.keys(toolsFor(userId, [DRIVE_READ_GRANT])).sort();

    expect(names).toEqual(READ_TOOL_NAMES);
  });

  test('offers the read and write tools at the write level', async () => {
    const { userId } = await seedAuthenticatedUser();

    const names = Object.keys(toolsFor(userId, [DRIVE_WRITE_GRANT])).sort();

    expect(names).toEqual(READ_TOOL_NAMES.concat(WRITE_TOOL_NAMES).sort());
  });

  test('offers no write tool at the read level', async () => {
    const { userId } = await seedAuthenticatedUser();

    const names = Object.keys(toolsFor(userId, [DRIVE_READ_GRANT]));

    for (const writeTool of WRITE_TOOL_NAMES) expect(names).not.toContain(writeTool);
  });

  test('skips stored grants that are invalid and still builds the valid ones', async () => {
    const { userId } = await seedAuthenticatedUser();

    const tools = toolsFor(userId, [
      { id: 'removed-tool' },
      { id: 'google-drive' },
      { id: 'google-drive', access: 'read' },
      { id: 'think' },
    ]);

    expect(Object.keys(tools).sort()).toEqual([...READ_TOOL_NAMES, 'think'].sort());
  });
});

describe('cloud drive tools: reading', () => {
  test('searches the drive and returns plain item fields', async () => {
    const tools = await connectedReader();

    const result = await callTool(tools, 'googleDriveSearch', { query: DRIVE_SEARCH_QUERY });

    expect(result).toEqual({
      status: 'ok',
      items: [DRIVE_DOC, DRIVE_SHARED_FILE].map((file) => ({
        id: file.id,
        name: file.name,
        kind: 'file',
        mimeType: file.mimeType,
        modifiedAt: file.modifiedAt.toISOString(),
        webUrl: file.webUrl,
        sizeBytes: file.sizeBytes,
      })),
      nextCursor: null,
    });
  });

  test('lists the root page by page with the returned cursor', async () => {
    const tools = await connectedReader();

    const first = await callTool(tools, 'googleDriveListFolder', {});
    const { nextCursor } = cursorSchema.parse(first);
    const second = await callTool(tools, 'googleDriveListFolder', { cursor: nextCursor });

    expect(first).toMatchObject({ status: 'ok', items: [{ kind: 'folder' }, {}] });
    expect(second).toMatchObject({ status: 'ok', nextCursor: null });
  });

  test('lists the content of a folder', async () => {
    const tools = await connectedReader();

    const result = await callTool(tools, 'googleDriveListFolder', { folderId: DRIVE_FOLDER.id });

    expect(result).toMatchObject({
      status: 'ok',
      items: [{ id: DRIVE_PDF.id }, { id: DRIVE_IMAGE.id }],
    });
  });

  test('reads a document as markdown', async () => {
    const tools = await connectedReader();

    const result = await callTool(tools, 'googleDriveReadFile', { fileId: DRIVE_DOC.id });

    expect(result).toEqual({
      status: 'ok',
      name: DRIVE_DOC.name,
      mimeType: 'text/markdown',
      webUrl: DRIVE_DOC.webUrl,
      text: DRIVE_DOC.exportText,
      truncated: false,
    });
  });

  test('reads a spreadsheet as csv', async () => {
    const tools = await connectedReader();

    const result = await callTool(tools, 'googleDriveReadFile', { fileId: DRIVE_SHEET.id });

    expect(result).toMatchObject({
      status: 'ok',
      mimeType: 'text/csv',
      text: DRIVE_SHEET.exportText,
    });
  });

  test('extracts the text of a PDF', async () => {
    const tools = await connectedReader();

    const result = await callTool(tools, 'googleDriveReadFile', { fileId: DRIVE_PDF.id });

    expect(result).toMatchObject({ status: 'ok', mimeType: 'application/pdf' });
    expect(JSON.stringify(result)).toContain(DRIVE_PDF_TEXT);
  });

  test('cuts long text and marks it truncated', async () => {
    const tools = await connectedReader();
    overrideVendorRoute(
      vendorRoute(
        GOOGLE_DRIVE_ENDPOINTS.export,
        () => new Response('a'.repeat(150_000), { headers: { 'content-type': 'text/markdown' } }),
      ),
    );

    const result = await callTool(tools, 'googleDriveReadFile', { fileId: DRIVE_DOC.id });

    expect(result).toMatchObject({ status: 'ok', truncated: true });
    expect(textSchema.parse(result).text).toHaveLength(100_000);
  });

  test.each([
    ['an image', DRIVE_IMAGE.id, 'unsupported'],
    ['a form', DRIVE_FORM.id, 'unsupported'],
    ['a file over the size limit', DRIVE_LARGE_FILE.id, 'too_large'],
    ['a missing file', DRIVE_MISSING_ID, 'not_found'],
  ])('answers %s with %s status', async (_label, fileId, status) => {
    const tools = await connectedReader();

    const result = await callTool(tools, 'googleDriveReadFile', { fileId });

    expect(result).toMatchObject({ status, message: expect.any(String) });
  });
});

describe('cloud drive tools: reading cost', () => {
  test('a read looks up the file metadata once', async () => {
    const tools = await connectedReader();

    await callTool(tools, 'googleDriveReadFile', { fileId: DRIVE_DOC.id });

    const lookups = vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.file);
    expect(lookups).toHaveLength(1);
    expect(vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.export)).toHaveLength(1);
  });
});

describe('cloud drive tools: writing', () => {
  async function connectedWriter() {
    const { userId } = await seedAuthenticatedUser();
    await seedGoogleDriveConnection({ userId });
    return toolsFor(userId, [DRIVE_WRITE_GRANT]);
  }

  test('creates a file and names it with a link', async () => {
    const tools = await connectedWriter();

    const result = await callTool(tools, 'googleDriveCreateFile', {
      name: 'summary.md',
      folderId: DRIVE_FOLDER.id,
      format: 'markdown',
      content: '# Summary',
    });

    expect(result).toEqual({
      status: 'ok',
      id: DRIVE_CREATED_FILE_ID,
      name: 'summary.md',
      webUrl: `https://drive.google.com/file/d/${DRIVE_CREATED_FILE_ID}/view`,
    });
  });

  test('creates a file in the root when no folder is given', async () => {
    const tools = await connectedWriter();

    const result = await callTool(tools, 'googleDriveCreateFile', {
      name: 'a.txt',
      format: 'text',
      content: 'a',
    });

    expect(result).toMatchObject({ status: 'ok', name: 'a.txt' });
    const [upload] = vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create);
    expect(upload?.body).not.toContain('parents');
  });

  test('updates a text file and names it with a link', async () => {
    const tools = await connectedWriter();

    const result = await callTool(tools, 'googleDriveUpdateFile', {
      fileId: DRIVE_NOTES.id,
      content: 'changed',
    });

    expect(result).toEqual({
      status: 'ok',
      id: DRIVE_NOTES.id,
      name: DRIVE_NOTES.name,
      webUrl: DRIVE_NOTES.webUrl,
    });
  });

  test('answers a file the connection may not change with read_only', async () => {
    const tools = await connectedWriter();

    const result = await callTool(tools, 'googleDriveUpdateFile', {
      fileId: DRIVE_READ_ONLY_FILE.id,
      content: 'changed',
    });

    expect(result).toEqual({
      status: 'read_only',
      message: 'This file in Google Drive is read-only for RAGNA Studio.',
    });
  });

  test('answers a native document with unsupported', async () => {
    const tools = await connectedWriter();

    const result = await callTool(tools, 'googleDriveUpdateFile', {
      fileId: DRIVE_DOC.id,
      content: 'changed',
    });

    expect(result).toMatchObject({ status: 'unsupported' });
    expect(vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.update)).toHaveLength(0);
  });

  test('answers a missing folder with not_found', async () => {
    const tools = await connectedWriter();
    failVendorEndpoint(GOOGLE_DRIVE_ENDPOINTS.create, { status: 404 });

    const result = await callTool(tools, 'googleDriveCreateFile', {
      name: 'a.txt',
      folderId: DRIVE_MISSING_ID,
      format: 'text',
      content: 'a',
    });

    expect(result).toMatchObject({ status: 'not_found' });
  });
});

describe('cloud drive tools: whose drive is read', () => {
  test('two users on one agent each read their own drive', async () => {
    const first = await seedAuthenticatedUser();
    const second = await seedAuthenticatedUser();
    await seedIntegrationConnection({
      userId: first.userId,
      provider: 'google',
      integrationIds: ['google-drive'],
      accessToken: 'token-of-first-user',
    });
    await seedIntegrationConnection({
      userId: second.userId,
      provider: 'google',
      integrationIds: ['google-drive'],
      accessToken: 'token-of-second-user',
    });
    const toolGrants = [DRIVE_READ_GRANT];

    await callTool(toolsFor(first.userId, toolGrants), 'googleDriveSearch', {
      query: 'plan',
    });
    await callTool(toolsFor(second.userId, toolGrants), 'googleDriveSearch', {
      query: 'plan',
    });

    const authorizations = vendorHttp.requests.map((request) =>
      request.headers.get('authorization'),
    );
    expect(authorizations).toEqual(['Bearer token-of-first-user', 'Bearer token-of-second-user']);
  });
});

describe('cloud drive tools: when the drive cannot be used', () => {
  test('says not_connected when the user never connected a drive', async () => {
    const { userId } = await seedAuthenticatedUser();

    const result = await callTool(toolsFor(userId, [DRIVE_READ_GRANT]), 'googleDriveSearch', {
      query: 'plan',
    });

    expect(result).toMatchObject({ status: 'not_connected' });
    expect(vendorHttp.requests).toHaveLength(0);
  });

  test('says not_connected when the connection has the drive switched off', async () => {
    const { userId } = await seedAuthenticatedUser();
    await seedIntegrationConnection({ userId, provider: 'google', integrationIds: ['gmail'] });

    const result = await callTool(toolsFor(userId, [DRIVE_READ_GRANT]), 'googleDriveSearch', {
      query: 'plan',
    });

    expect(result).toMatchObject({ status: 'not_connected' });
  });

  test('says reconnect when the connection needs re-authorization', async () => {
    const { userId } = await seedAuthenticatedUser();
    await seedGoogleDriveConnection({ userId, status: 'needs_reauth' });

    const result = await callTool(toolsFor(userId, [DRIVE_READ_GRANT]), 'googleDriveSearch', {
      query: 'plan',
    });

    expect(result).toMatchObject({ status: 'reconnect' });
  });

  test('says reconnect when the vendor keeps rejecting the token', async () => {
    const { userId } = await seedAuthenticatedUser();
    const connection = await seedGoogleDriveConnection({ userId });
    await expireConnectionAccessToken({ connectionId: connection.id });
    failVendorEndpoint(GOOGLE_DRIVE_ENDPOINTS.list, { status: 401, headers: NO_WAIT_HEADERS });

    const result = await callTool(toolsFor(userId, [DRIVE_READ_GRANT]), 'googleDriveSearch', {
      query: 'plan',
    });

    expect(result).toMatchObject({ status: 'reconnect' });
  });

  test('says busy after the vendor kept rate limiting, without leaking the token', async () => {
    const { userId } = await seedAuthenticatedUser();
    await seedIntegrationConnection({
      userId,
      provider: 'google',
      integrationIds: ['google-drive'],
      accessToken: 'secret-access-token',
      refreshToken: 'secret-refresh-token',
    });
    failVendorEndpoint(GOOGLE_DRIVE_ENDPOINTS.list, {
      status: 403,
      body: GOOGLE_DRIVE_RATE_LIMIT_BODY,
      headers: NO_WAIT_HEADERS,
    });

    const result = await callTool(toolsFor(userId, [DRIVE_READ_GRANT]), 'googleDriveSearch', {
      query: 'plan',
    });

    expect(result).toMatchObject({ status: 'busy' });
    expect(JSON.stringify(result)).not.toContain('secret-');
  });
});
