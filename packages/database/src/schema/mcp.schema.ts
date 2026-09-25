import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export type McpAccessLevel = 'off' | 'read' | 'write';
export type McpIntegrationId = 'datasets';
export type McpAccess = Partial<Record<McpIntegrationId, McpAccessLevel>>;

const emptyMcpAccess: McpAccess = {};

// One row per user (docs/mcp/prd.md, "Settings page"): the master toggle
// and per-integration access. Missing key in `access` means 'off'.
export const mcpSettings = pgTable('mcp_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  access: jsonb('access').notNull().$type<McpAccess>().default(emptyMcpAccess),
  ...timestamps,
});

export type McpSettings = typeof mcpSettings.$inferSelect;
export type NewMcpSettings = typeof mcpSettings.$inferInsert;

// One row per (user, client) connection (P9): the workspace a Claude
// connector is bound to. `clientId` is the CIMD client ID URL, matching
// `oauthClient.clientId`.
export const mcpConnection = pgTable(
  'mcp_connections',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    lastUsedAt: timestamp('last_used_at', { precision: 3 }),
    ...timestamps,
  },
  (table) => [
    index('mcpConnection_userId_idx').on(table.userId),
    index('mcpConnection_workspaceId_idx').on(table.workspaceId),
    uniqueIndex('mcpConnection_userId_clientId_idx').on(table.userId, table.clientId),
  ],
);

export type McpConnection = typeof mcpConnection.$inferSelect;
export type NewMcpConnection = typeof mcpConnection.$inferInsert;

// Audit trail for write calls only (P7); reads only touch
// mcp_connections.last_used_at.
export const mcpToolCall = pgTable(
  'mcp_tool_calls',
  {
    id: primaryIdColumn,
    connectionId: text('connection_id')
      .notNull()
      .references(() => mcpConnection.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    isError: boolean('is_error').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).defaultNow().notNull(),
  },
  (table) => [index('mcpToolCall_connectionId_idx').on(table.connectionId)],
);

export type McpToolCall = typeof mcpToolCall.$inferSelect;
export type NewMcpToolCall = typeof mcpToolCall.$inferInsert;
