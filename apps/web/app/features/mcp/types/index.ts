export type McpAccessLevel = 'off' | 'read' | 'write';

export type McpIntegrationId = 'datasets';

export type McpAccess = Partial<Record<McpIntegrationId, McpAccessLevel>>;

export interface McpSettingsResponse {
  enabled: boolean;
  access: McpAccess;
  connectorUrl: string;
}

export interface UpdateMcpSettingsRequest {
  enabled: boolean;
  access: McpAccess;
}

export interface McpConnection {
  id: string;
  clientId: string;
  clientName: string | null;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface McpConnectionsResponse {
  connections: McpConnection[];
}

export interface CreateMcpConnectionRequest {
  clientId: string;
  workspaceId: string;
}

export interface McpConnectionResponse {
  connection: McpConnection;
}
