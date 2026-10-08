import { getMcpSettings, upsertMcpSettings } from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { seedMcpConnection, seedOAuthClient, TEST_MCP_CLIENT_ID } from './support/mcp-fixtures';

// /mcp-settings: C4, session-authenticated REST for the
// settings page slice 4 builds against.

const mcpSettingsResponseSchema = z.object({
  enabled: z.boolean(),
  access: z.object({ datasets: z.enum(['off', 'read', 'write']).optional() }),
  connectorUrl: z.string(),
});

const mcpConnectionListResponseSchema = z.object({
  connections: z.array(
    z.object({
      id: z.string(),
      clientId: z.string(),
      clientName: z.string().nullable(),
      workspaceId: z.string(),
      workspaceName: z.string(),
      createdAt: z.string(),
      lastUsedAt: z.string().nullable(),
    }),
  ),
});

const mcpConnectionCreateResponseSchema = z.object({
  connection: z.object({
    id: z.string(),
    clientId: z.string(),
    workspaceId: z.string(),
  }),
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('GET /mcp-settings', () => {
  test('defaults to disabled with no access', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/mcp-settings', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.OK);
    const body = mcpSettingsResponseSchema.parse(await response.json());
    expect(body).toEqual({ enabled: false, access: {}, connectorUrl: expect.any(String) });
  });

  test('rejects an unauthenticated request', async () => {
    const response = await app.request('/mcp-settings');
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('PUT /mcp-settings', () => {
  test('turns MCP on with per-integration access', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/mcp-settings', {
      method: 'PUT',
      headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, access: { datasets: 'write' } }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = mcpSettingsResponseSchema.parse(await response.json());
    expect(body.enabled).toBe(true);
    expect(body.access).toEqual({ datasets: 'write' });
  });

  test('turning off deletes every connection', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedOAuthClient();
    await seedMcpConnection({ userId, workspaceId, access: { datasets: 'read' } });

    const response = await app.request('/mcp-settings', {
      method: 'PUT',
      headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, access: {} }),
    });
    expect(response.status).toBe(StatusCodes.OK);

    const connectionsResponse = await app.request('/mcp-settings/connections', {
      headers: { cookie: cookieHeader },
    });
    const connectionsBody = mcpConnectionListResponseSchema.parse(await connectionsResponse.json());
    expect(connectionsBody.connections).toEqual([]);
  });
});

describe('GET /mcp-settings/connections', () => {
  test('lists a seeded connection with its workspace and client name', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedOAuthClient({ name: 'Claude Desktop' });
    await seedMcpConnection({ userId, workspaceId, access: { datasets: 'read' } });

    const response = await app.request('/mcp-settings/connections', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = mcpConnectionListResponseSchema.parse(await response.json());
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]).toMatchObject({
      clientId: TEST_MCP_CLIENT_ID,
      clientName: 'Claude Desktop',
      workspaceId,
    });
  });
});

describe('POST /mcp-settings/connections', () => {
  test('403s when MCP is disabled for the user', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedOAuthClient();

    const response = await app.request('/mcp-settings/connections', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: TEST_MCP_CLIENT_ID, workspaceId }),
    });

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test("404s for a workspace that is not the user's", async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    await seedOAuthClient();
    await upsertMcpSettings({ userId, enabled: true, access: { datasets: 'read' } });

    const response = await app.request('/mcp-settings/connections', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: TEST_MCP_CLIENT_ID, workspaceId: other.workspaceId }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test("creates a connection for the user's own workspace", async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedOAuthClient();
    const settings = await getMcpSettings({ userId });
    expect(settings.enabled).toBe(false);
    await upsertMcpSettings({ userId, enabled: true, access: { datasets: 'read' } });

    const response = await app.request('/mcp-settings/connections', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: TEST_MCP_CLIENT_ID, workspaceId }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = mcpConnectionCreateResponseSchema.parse(await response.json());
    expect(body.connection).toMatchObject({ clientId: TEST_MCP_CLIENT_ID, workspaceId });
  });
});

describe('DELETE /mcp-settings/connections/:connectionId', () => {
  test('revokes and removes the connection', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedOAuthClient();
    const connection = await seedMcpConnection({
      userId,
      workspaceId,
      access: { datasets: 'read' },
    });

    const response = await app.request(`/mcp-settings/connections/${connection.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NO_CONTENT);

    const listResponse = await app.request('/mcp-settings/connections', {
      headers: { cookie: cookieHeader },
    });
    const listBody = mcpConnectionListResponseSchema.parse(await listResponse.json());
    expect(listBody.connections).toEqual([]);
  });

  test('404s for a connection id that does not belong to the user', async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    await seedOAuthClient();
    const connection = await seedMcpConnection({
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      access: { datasets: 'read' },
    });

    const response = await app.request(`/mcp-settings/connections/${connection.id}`, {
      method: 'DELETE',
      headers: { cookie: other.cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
