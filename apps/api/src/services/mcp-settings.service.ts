import { config } from '@repo/config';
import type { McpAccess, McpConnection, McpConnectionSummary } from '@repo/database';
import {
  deleteAllMcpConnections,
  deleteMcpConnection,
  getMcpSettings,
  getWorkspaceForMember,
  listMcpConnections,
  revokeMcpClientGrants,
  upsertMcpConnection,
  upsertMcpSettings,
} from '@repo/database';
import { ForbiddenException, NotFoundException } from '../exceptions';

export interface McpSettingsResponse {
  enabled: boolean;
  access: McpAccess;
  connectorUrl: string;
}

export interface McpConnectionListResponse {
  connections: McpConnectionSummary[];
}

function toMcpSettingsResponse(settings: {
  enabled: boolean;
  access: McpAccess;
}): McpSettingsResponse {
  return {
    enabled: settings.enabled,
    access: settings.access,
    connectorUrl: config.mcpResourceUrl,
  };
}

export async function getMcpSettingsForUser({
  userId,
}: {
  userId: string;
}): Promise<McpSettingsResponse> {
  const settings = await getMcpSettings({ userId });
  return toMcpSettingsResponse(settings);
}

/**
 * Turning the master toggle off revokes every connection and its grants
 * (P3): the next time it's turned on, the user starts from zero.
 */
export async function updateMcpSettingsForUser({
  userId,
  enabled,
  access,
}: {
  userId: string;
  enabled: boolean;
  access: McpAccess;
}): Promise<McpSettingsResponse> {
  const settings = await upsertMcpSettings({ userId, enabled, access });

  if (!enabled) {
    const connections = await listMcpConnections({ userId });
    await Promise.all(
      connections.map((connection) =>
        revokeMcpClientGrants({ userId, clientId: connection.clientId }),
      ),
    );
    await deleteAllMcpConnections({ userId });
  }

  return toMcpSettingsResponse(settings);
}

export async function listMcpConnectionsForUser({
  userId,
}: {
  userId: string;
}): Promise<McpConnectionListResponse> {
  const connections = await listMcpConnections({ userId });
  return { connections };
}

export async function createMcpConnectionForUser({
  userId,
  clientId,
  workspaceId,
}: {
  userId: string;
  clientId: string;
  workspaceId: string;
}): Promise<McpConnection> {
  const settings = await getMcpSettings({ userId });
  if (!settings.enabled) {
    throw new ForbiddenException('MCP is disabled for this user');
  }

  const workspace = await getWorkspaceForMember({ workspaceId, userId });
  if (!workspace) {
    throw new NotFoundException('Workspace not found');
  }

  return upsertMcpConnection({ userId, clientId, workspaceId });
}

export async function deleteMcpConnectionForUser({
  userId,
  connectionId,
}: {
  userId: string;
  connectionId: string;
}): Promise<void> {
  const connections = await listMcpConnections({ userId });
  const connection = connections.find((candidate) => candidate.id === connectionId);
  if (!connection) {
    throw new NotFoundException('Connection not found');
  }

  await revokeMcpClientGrants({ userId, clientId: connection.clientId });
  await deleteMcpConnection({ connectionId, userId });
}
