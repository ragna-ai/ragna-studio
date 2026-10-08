import { createDataset, createDatasetRow, db, deleteMcpConnection, getDatasetRowById } from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import {
  installMcpJwksFetchBridge,
  uninstallMcpJwksFetchBridge,
} from './support/jwks-fetch-bridge';
import { mintMcpAccessToken, seedMcpConnection, seedOAuthClient } from './support/mcp-fixtures';

// /mcp: the Streamable HTTP JSON-RPC endpoint (specs/mcp/prd.md section 3,
// "Testing"). requireMcpAuth verifies the bearer token against the auth
// server's own JWKS over a real fetch to `${baseURL}/jwks`; see
// support/jwks-fetch-bridge.ts for why that needs a bridge rather than a
// real listening port. The OAuth dance itself (CIMD, consent, token
// exchange) is manual-tested with Claude Desktop, not here.

// Protocol revision 2026-07-28 carries its envelope per request rather than
// once at `initialize` (specs/mcp/prd.md section 3): every request needs the
// protocol version and client capabilities under reserved `_meta` keys.
const MCP_PROTOCOL_VERSION = '2026-07-28';

function jsonRpcRequest(method: string, params?: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  };
}

async function postMcp(
  token: string | null,
  method: string,
  params?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Mcp-Protocol-Version': MCP_PROTOCOL_VERSION,
    'Mcp-Method': method,
    ...extraHeaders,
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return app.request('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(jsonRpcRequest(method, params)),
  });
}

async function listTools(token: string) {
  return postMcp(token, 'tools/list');
}

async function callTool(token: string, name: string, args: Record<string, unknown>) {
  return postMcp(token, 'tools/call', { name, arguments: args }, { 'Mcp-Name': name });
}

beforeAll(() => {
  installMcpJwksFetchBridge();
});

afterAll(() => {
  uninstallMcpJwksFetchBridge();
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('POST /mcp: authentication', () => {
  test('rejects a request with no bearer token', async () => {
    const response = await postMcp(null, 'tools/list');

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
  });

  test('rejects a malformed bearer token', async () => {
    const response = await postMcp('not-a-real-jwt', 'tools/list');

    expect(response.status).toBe(401);
  });

  test('rejects a token with the wrong audience', async () => {
    const { userId } = await seedAuthenticatedUser();
    const token = await mintMcpAccessToken({ userId, audience: 'https://not-ragna.example/mcp' });

    const response = await postMcp(token, 'tools/list');

    expect(response.status).toBe(401);
  });

  test('rejects a valid session cookie without a bearer token', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(jsonRpcRequest('tools/list')),
    });

    expect(response.status).toBe(401);
  });

  test('rejects a token for a user with MCP disabled', async () => {
    const { userId } = await seedAuthenticatedUser();
    const token = await mintMcpAccessToken({ userId });

    const response = await listTools(token);

    expect(response.status).toBe(401);
  });

  test('rejects a token for a revoked connection', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedOAuthClient();
    const connection = await seedMcpConnection({ userId, workspaceId, access: { datasets: 'read' } });
    const token = await mintMcpAccessToken({ userId });
    await deleteMcpConnection({ connectionId: connection.id, userId });

    const response = await listTools(token);

    expect(response.status).toBe(401);
  });
});

describe('POST /mcp: tools/list follows settings', () => {
  test('read access excludes write tools', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedOAuthClient();
    await seedMcpConnection({ userId, workspaceId, access: { datasets: 'read' } });
    const token = await mintMcpAccessToken({ userId });

    const response = await listTools(token);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      result: { tools: { name: string }[] };
    };
    const toolNames = body.result.tools.map((tool) => tool.name);

    expect(toolNames).toContain('datasetFind');
    expect(toolNames).not.toContain('datasetAppendRow');
    expect(toolNames).not.toContain('datasetCreate');
  });

  test('write access includes read and write tools', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedOAuthClient();
    await seedMcpConnection({ userId, workspaceId, access: { datasets: 'write' } });
    const token = await mintMcpAccessToken({ userId });

    const response = await listTools(token);
    const body = (await response.json()) as {
      result: { tools: { name: string }[] };
    };
    const toolNames = body.result.tools.map((tool) => tool.name);

    expect(toolNames).toContain('datasetFind');
    expect(toolNames).toContain('datasetAppendRow');
  });
});

describe('POST /mcp: tools/call', () => {
  test('a write call is not allowed when access is read', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedOAuthClient();
    await seedMcpConnection({ userId, workspaceId, access: { datasets: 'read' } });
    const token = await mintMcpAccessToken({ userId });

    const response = await callTool(token, 'datasetAppendRow', {
      datasetId: 'does-not-matter',
      data: {},
    });

    const body = (await response.json()) as { error?: { message: string } };
    expect(body.error?.message).toContain('not found');
  });

  test('append and update work when access is write, stamp written_by=mcp, and are audited', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    await seedOAuthClient();
    const connection = await seedMcpConnection({
      userId,
      workspaceId,
      access: { datasets: 'write' },
    });
    const token = await mintMcpAccessToken({ userId });

    const dataset = await createDataset({
      userId,
      workspaceId,
      name: 'MCP dataset',
      columns: [{ id: 'status', name: 'Status', type: 'text' }],
    });

    const appendResponse = await callTool(token, 'datasetAppendRow', {
      datasetId: dataset.id,
      data: { status: 'todo' },
    });
    expect(appendResponse.status).toBe(200);
    const appendBody = (await appendResponse.json()) as {
      result: { structuredContent: { row: { id: string; writtenBy: string } } };
    };
    expect(appendBody.result.structuredContent.row.writtenBy).toBe('mcp');

    const persistedRow = await getDatasetRowById({
      datasetId: dataset.id,
      rowId: appendBody.result.structuredContent.row.id,
    });
    expect(persistedRow?.writtenBy).toBe('mcp');

    const auditedCalls = await db.query.mcpToolCall.findMany({
      where: { connectionId: connection.id },
    });
    expect(auditedCalls.some((call) => call.toolName === 'datasetAppendRow')).toBe(true);

    const refreshedConnection = await db.query.mcpConnection.findFirst({
      where: { id: connection.id },
    });
    expect(refreshedConnection?.lastUsedAt).not.toBeNull();
  });

  test('workspace isolation: a dataset in another workspace is not found', async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    await seedOAuthClient();
    await seedMcpConnection({
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      access: { datasets: 'write' },
    });
    const token = await mintMcpAccessToken({ userId: owner.userId });

    const foreignDataset = await createDataset({
      userId: other.userId,
      workspaceId: other.workspaceId,
      name: 'Not yours',
      columns: [],
    });
    await createDatasetRow({ datasetId: foreignDataset.id, userId: other.userId, data: {} });

    const response = await callTool(token, 'datasetListRows', { datasetId: foreignDataset.id });
    const body = (await response.json()) as {
      result: { isError: boolean; structuredContent?: { error: string } };
    };

    expect(body.result.isError).toBe(true);
  });
});
