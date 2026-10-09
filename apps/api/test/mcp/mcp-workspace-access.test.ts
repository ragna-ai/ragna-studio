import { upsertMcpSettings } from '@repo/database';
import { truncateAllTables } from '@repo/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import {
  deleteWorkspaceMember,
  insertWorkspace,
  insertWorkspaceMember,
  seedOrganizationWithRoles,
} from '../workspace/workspace-access-fixtures';
import {
  installMcpJwksFetchBridge,
  uninstallMcpJwksFetchBridge,
} from './support/jwks-fetch-bridge';
import {
  mintMcpAccessToken,
  seedMcpConnection,
  seedOAuthClient,
  TEST_MCP_CLIENT_ID,
} from './support/mcp-fixtures';

// An MCP connection follows the user's access to its workspace.

beforeAll(() => {
  installMcpJwksFetchBridge();
});

afterAll(() => {
  uninstallMcpJwksFetchBridge();
});

beforeEach(async () => {
  await truncateAllTables();
});

function listTools(token: string) {
  return app.request('/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'Mcp-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/list',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}

function connectWorkspace(cookieHeader: string, workspaceId: string) {
  return app.request('/mcp-settings/connections', {
    method: 'POST',
    headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: TEST_MCP_CLIENT_ID, workspaceId }),
  });
}

async function seedConnectionToRestrictedWorkspace() {
  const { organizationId, member } = await seedOrganizationWithRoles();
  const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
  await insertWorkspaceMember({ workspaceId, userId: member.userId, role: 'editor' });
  await seedOAuthClient();
  await seedMcpConnection({ userId: member.userId, workspaceId, access: { datasets: 'read' } });
  const token = await mintMcpAccessToken({ userId: member.userId });
  return { member, workspaceId, token };
}

describe('MCP connection to a restricted workspace', () => {
  test('works while the user is a workspace member', async () => {
    const { token } = await seedConnectionToRestrictedWorkspace();

    expect((await listTools(token)).status).toBe(StatusCodes.OK);
  });

  test('asks the client to reconnect once the user lost the workspace', async () => {
    const { member, workspaceId, token } = await seedConnectionToRestrictedWorkspace();
    await deleteWorkspaceMember({ workspaceId, userId: member.userId });

    expect((await listTools(token)).status).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('POST /mcp-settings/connections', () => {
  test('404s for a restricted workspace the user is not a workspace member of', async () => {
    const { organizationId, member } = await seedOrganizationWithRoles();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await seedOAuthClient();
    await upsertMcpSettings({ userId: member.userId, enabled: true, access: { datasets: 'read' } });

    const response = await connectWorkspace(member.cookieHeader, workspaceId);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test("404s for a colleague's personal workspace", async () => {
    const { owner, member } = await seedOrganizationWithRoles();
    await seedOAuthClient();
    await upsertMcpSettings({ userId: owner.userId, enabled: true, access: { datasets: 'read' } });

    const response = await connectWorkspace(owner.cookieHeader, member.personalWorkspaceId);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
