import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import type { McpAccess, McpConnection } from '../schema';
import { workspaceAccessCondition } from './workspace.repo';
import {
  mcpConnection,
  mcpSettings,
  mcpToolCall,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  workspace,
} from '../schema';

export type { McpAccess, McpAccessLevel, McpIntegrationId, McpConnection } from '../schema';

export interface McpSettingsRecord {
  userId: string;
  enabled: boolean;
  access: McpAccess;
}

export interface McpConnectionSummary {
  id: string;
  clientId: string;
  clientName: string | null;
  workspaceId: string;
  workspaceName: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

// Settings are read on every tools/list and tools/call (P1), so a user who
// never opted in gets the off-by-default shape instead of a missing row.
export async function getMcpSettings({ userId }: { userId: string }): Promise<McpSettingsRecord> {
  const record = await db.query.mcpSettings.findFirst({ where: { userId } });
  if (!record) {
    return { userId, enabled: false, access: {} };
  }
  return { userId: record.userId, enabled: record.enabled, access: record.access };
}

export async function upsertMcpSettings({
  userId,
  enabled,
  access,
}: {
  userId: string;
  enabled: boolean;
  access: McpAccess;
}): Promise<McpSettingsRecord> {
  const [record] = await db
    .insert(mcpSettings)
    .values({ userId, enabled, access })
    .onConflictDoUpdate({ target: mcpSettings.userId, set: { enabled, access } })
    .returning();

  if (!record) {
    throw new Error('Failed to upsert MCP settings');
  }

  return { userId: record.userId, enabled: record.enabled, access: record.access };
}

/** Unique on (userId, clientId) (P9): approving consent again replaces the workspace. */
export async function upsertMcpConnection({
  userId,
  clientId,
  workspaceId,
}: {
  userId: string;
  clientId: string;
  workspaceId: string;
}): Promise<McpConnection> {
  const [connection] = await db
    .insert(mcpConnection)
    .values({ userId, clientId, workspaceId })
    .onConflictDoUpdate({
      target: [mcpConnection.userId, mcpConnection.clientId],
      set: { workspaceId },
    })
    .returning();

  if (!connection) {
    throw new Error('Failed to upsert MCP connection');
  }

  return connection;
}

export async function findMcpConnection({
  userId,
  clientId,
}: {
  userId: string;
  clientId: string;
}): Promise<McpConnection | null> {
  const [row] = await db
    .select({ connection: mcpConnection })
    .from(mcpConnection)
    .innerJoin(workspace, eq(workspace.id, mcpConnection.workspaceId))
    .where(
      and(
        eq(mcpConnection.userId, userId),
        eq(mcpConnection.clientId, clientId),
        workspaceAccessCondition({ userId }),
      ),
    )
    .limit(1);

  return row?.connection ?? null;
}

export async function listMcpConnections({
  userId,
}: {
  userId: string;
}): Promise<McpConnectionSummary[]> {
  return db
    .select({
      id: mcpConnection.id,
      clientId: mcpConnection.clientId,
      clientName: oauthClient.name,
      workspaceId: mcpConnection.workspaceId,
      workspaceName: workspace.name,
      createdAt: mcpConnection.createdAt,
      lastUsedAt: mcpConnection.lastUsedAt,
    })
    .from(mcpConnection)
    .innerJoin(workspace, eq(mcpConnection.workspaceId, workspace.id))
    .leftJoin(oauthClient, eq(mcpConnection.clientId, oauthClient.clientId))
    .where(eq(mcpConnection.userId, userId))
    .orderBy(desc(mcpConnection.createdAt));
}

export async function deleteMcpConnection({
  connectionId,
  userId,
}: {
  connectionId: string;
  userId: string;
}): Promise<void> {
  await db
    .delete(mcpConnection)
    .where(and(eq(mcpConnection.id, connectionId), eq(mcpConnection.userId, userId)));
}

export async function deleteAllMcpConnections({ userId }: { userId: string }): Promise<void> {
  await db.delete(mcpConnection).where(eq(mcpConnection.userId, userId));
}

/**
 * Mirrors the OAuth Provider plugin's own `invalidateRefreshFamily`: deletes
 * the client's access tokens issued off a refresh token, the refresh tokens
 * themselves, and the consent record, so a revoked connection can't be
 * silently resumed by an unexpired refresh token still sitting in the client.
 */
export async function revokeMcpClientGrants({
  userId,
  clientId,
}: {
  userId: string;
  clientId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const refreshTokens = await tx
      .select({ id: oauthRefreshToken.id })
      .from(oauthRefreshToken)
      .where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)));

    if (refreshTokens.length > 0) {
      await tx.delete(oauthAccessToken).where(
        inArray(
          oauthAccessToken.refreshId,
          refreshTokens.map((token) => token.id),
        ),
      );
    }

    await tx
      .delete(oauthRefreshToken)
      .where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)));
    await tx
      .delete(oauthConsent)
      .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)));
  });
}

export async function touchMcpConnection({
  connectionId,
}: {
  connectionId: string;
}): Promise<void> {
  await db
    .update(mcpConnection)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpConnection.id, connectionId));
}

export async function recordMcpToolCall({
  connectionId,
  toolName,
  isError,
}: {
  connectionId: string;
  toolName: string;
  isError: boolean;
}): Promise<void> {
  await db.insert(mcpToolCall).values({ connectionId, toolName, isError });
}
