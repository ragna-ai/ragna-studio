import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import type {
  IntegrationConnection,
  IntegrationOauthState,
  IntegrationProviderId,
  NewIntegrationOauthState,
} from '../schema';
import { integrationConnection, integrationOauthState } from '../schema';

export type {
  IntegrationConnection,
  IntegrationConnectionStatus,
  IntegrationOauthState,
  IntegrationProviderId,
} from '../schema';

export interface UpsertUserConnectionParams {
  organizationId: string;
  userId: string;
  provider: IntegrationProviderId;
  externalAccountId: string;
  externalEmail: string | null;
  displayName: string | null;
  scopes: string[];
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
}

/** Inserts the user's connection for the provider, or replaces it with the fresh grant. */
export async function upsertUserConnection(
  params: UpsertUserConnectionParams,
): Promise<IntegrationConnection> {
  const lastRefreshedAt = new Date();

  const [connection] = await db
    .insert(integrationConnection)
    .values({
      organizationId: params.organizationId,
      userId: params.userId,
      createdByUserId: params.userId,
      provider: params.provider,
      externalAccountId: params.externalAccountId,
      externalEmail: params.externalEmail,
      displayName: params.displayName,
      scopes: params.scopes,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      accessTokenExpiresAt: params.accessTokenExpiresAt,
      status: 'active',
      lastRefreshedAt,
    })
    .onConflictDoUpdate({
      target: [integrationConnection.userId, integrationConnection.provider],
      targetWhere: sql`${integrationConnection.userId} IS NOT NULL`,
      set: {
        externalAccountId: params.externalAccountId,
        externalEmail: params.externalEmail,
        displayName: params.displayName,
        scopes: params.scopes,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        accessTokenExpiresAt: params.accessTokenExpiresAt,
        status: 'active',
        authFailedAt: null,
        authFailedReason: null,
        lastRefreshedAt,
      },
    })
    .returning();

  if (!connection) {
    throw new Error('Failed to save integration connection');
  }

  return connection;
}

export async function getConnectionById({
  id,
}: {
  id: string;
}): Promise<IntegrationConnection | null> {
  const found = await db.query.integrationConnection.findFirst({ where: { id } });

  return found ?? null;
}

export async function getUserConnectionById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<IntegrationConnection | null> {
  const found = await db.query.integrationConnection.findFirst({ where: { id, userId } });

  return found ?? null;
}

export async function getUserConnectionByProvider({
  userId,
  provider,
}: {
  userId: string;
  provider: IntegrationProviderId;
}): Promise<IntegrationConnection | null> {
  const found = await db.query.integrationConnection.findFirst({ where: { userId, provider } });

  return found ?? null;
}

export async function listUserConnections({
  userId,
}: {
  userId: string;
}): Promise<IntegrationConnection[]> {
  return db.query.integrationConnection.findMany({
    where: { userId },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
}

export async function deleteConnectionById({ id }: { id: string }): Promise<void> {
  await db.delete(integrationConnection).where(eq(integrationConnection.id, id));
}

export async function deleteUserConnections({ userId }: { userId: string }): Promise<void> {
  await db.delete(integrationConnection).where(eq(integrationConnection.userId, userId));
}

export interface ConnectionTokenPatch {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  scopes?: string[];
}

export type ConnectionTokenUpdater = (patch: ConnectionTokenPatch) => Promise<void>;

export interface WithLockedConnectionParams<T> {
  connectionId: string;
  run: (connection: IntegrationConnection | null, saveTokens: ConnectionTokenUpdater) => Promise<T>;
}

/**
 * Runs `run` inside a transaction holding an advisory lock on the connection, with the row
 * re-read after the lock. API and worker callers of the same connection take turns here.
 */
export async function withLockedConnection<T>({
  connectionId,
  run,
}: WithLockedConnectionParams<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${connectionId}, 0))`);

    const connection = await tx.query.integrationConnection.findFirst({
      where: { id: connectionId },
    });

    const saveTokens: ConnectionTokenUpdater = async (patch) => {
      await tx
        .update(integrationConnection)
        .set({
          accessToken: patch.accessToken,
          refreshToken: patch.refreshToken,
          accessTokenExpiresAt: patch.accessTokenExpiresAt,
          scopes: patch.scopes,
          lastRefreshedAt: new Date(),
        })
        .where(eq(integrationConnection.id, connectionId));
    };

    return run(connection ?? null, saveTokens);
  });
}

/** True only for the call that moved the connection from active to needs_reauth. */
export async function markConnectionNeedsReauth({
  id,
  reason,
}: {
  id: string;
  reason: string;
}): Promise<boolean> {
  const updated = await db
    .update(integrationConnection)
    .set({ status: 'needs_reauth', authFailedAt: new Date(), authFailedReason: reason })
    .where(and(eq(integrationConnection.id, id), eq(integrationConnection.status, 'active')))
    .returning({ id: integrationConnection.id });

  return updated.length > 0;
}

// OAUTH STATES

export async function createOauthState(
  values: NewIntegrationOauthState,
): Promise<IntegrationOauthState> {
  const [created] = await db.insert(integrationOauthState).values(values).returning();

  if (!created) {
    throw new Error('Failed to create OAuth state');
  }

  return created;
}

/** Deletes and returns the user's state if it has not expired. A state can be used once. */
export async function consumeOauthState({
  state,
  userId,
}: {
  state: string;
  userId: string;
}): Promise<IntegrationOauthState | null> {
  const [consumed] = await db
    .delete(integrationOauthState)
    .where(
      and(
        eq(integrationOauthState.state, state),
        eq(integrationOauthState.userId, userId),
        gt(integrationOauthState.expiresAt, new Date()),
      ),
    )
    .returning();

  return consumed ?? null;
}

export async function deleteExpiredOauthStates(): Promise<number> {
  const deleted = await db
    .delete(integrationOauthState)
    .where(lt(integrationOauthState.expiresAt, new Date()))
    .returning({ state: integrationOauthState.state });

  return deleted.length;
}
