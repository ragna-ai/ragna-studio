import { listIntegrationsForProvider, saveUserConnectionGrant } from '@repo/integrations';
import type { IntegrationConnectionStatus, IntegrationProviderId } from '@repo/database';
import { db, getConnectionById, getOrganizationIdByUserId, sql } from '@repo/database';
import { integrationConnection, type IntegrationConnection } from '@repo/database/schema';
import { assertConnectedToTestDatabase } from '../db/db-guard';

export const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
export const GOOGLE_IDENTITY_SCOPES = ['openid', 'email', 'profile'];

export interface SeedIntegrationConnectionParams {
  userId: string;
  provider: IntegrationProviderId;
  scopes?: string[];
  externalEmail?: string | null;
  accessToken?: string;
  refreshToken?: string | null;
  /** Defaults to an hour out. Pass a past date to force a refresh. */
  accessTokenExpiresAt?: Date;
  status?: IntegrationConnectionStatus;
}

export interface SeededIntegrationConnection {
  connection: IntegrationConnection;
  accessToken: string;
  refreshToken: string | null;
}

export async function seedIntegrationConnection(
  params: SeedIntegrationConnectionParams,
): Promise<SeededIntegrationConnection> {
  await assertConnectedToTestDatabase();

  const organizationId = await getOrganizationIdByUserId({ userId: params.userId });
  if (!organizationId) {
    throw new Error(`User ${params.userId} has no organization.`);
  }
  const integration = listIntegrationsForProvider(params.provider)[0];
  if (!integration) {
    throw new Error(`No integration for provider ${params.provider}.`);
  }

  const accessToken = params.accessToken ?? `test-access-token-${crypto.randomUUID()}`;
  const refreshToken =
    params.refreshToken === undefined
      ? `test-refresh-token-${crypto.randomUUID()}`
      : params.refreshToken;

  const saved = await saveUserConnectionGrant({
    organizationId,
    userId: params.userId,
    integration,
    profile: {
      id: `${params.provider}-account-${crypto.randomUUID()}`,
      email: params.externalEmail ?? null,
      name: null,
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresAt: params.accessTokenExpiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      scopes: params.scopes ?? [],
    },
  });

  if (params.status === 'needs_reauth') {
    await db
      .update(integrationConnection)
      .set({ status: 'needs_reauth' })
      .where(sql`${integrationConnection.id} = ${saved.id}`);
  }

  const connection = await getConnectionById({ id: saved.id });
  if (!connection) {
    throw new Error('Failed to seed the integration connection');
  }

  return { connection, accessToken, refreshToken };
}

/** A Google connection with the gmail.modify scope, the state every mailbox route needs. */
export function seedGmailConnection(
  params: Omit<SeedIntegrationConnectionParams, 'provider'>,
): Promise<SeededIntegrationConnection> {
  return seedIntegrationConnection({
    userId: params.userId,
    provider: 'google',
    scopes: params.scopes ?? GOOGLE_IDENTITY_SCOPES.concat(GMAIL_MODIFY_SCOPE),
    externalEmail: params.externalEmail,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    accessTokenExpiresAt: params.accessTokenExpiresAt,
    status: params.status,
  });
}

export function seedOutlookConnection(
  params: Omit<SeedIntegrationConnectionParams, 'provider'>,
): Promise<SeededIntegrationConnection> {
  return seedIntegrationConnection({
    userId: params.userId,
    provider: 'microsoft',
    scopes: params.scopes ?? [
      'openid',
      'profile',
      'email',
      'offline_access',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Mail.Send',
    ],
    externalEmail: params.externalEmail,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    accessTokenExpiresAt: params.accessTokenExpiresAt,
    status: params.status,
  });
}

export function seedLinkedinConnection(
  params: Omit<SeedIntegrationConnectionParams, 'provider'>,
): Promise<SeededIntegrationConnection> {
  return seedIntegrationConnection({
    userId: params.userId,
    provider: 'linkedin',
    scopes: params.scopes ?? ['openid', 'profile', 'email', 'w_member_social'],
    externalEmail: params.externalEmail,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    accessTokenExpiresAt: params.accessTokenExpiresAt,
    status: params.status,
  });
}

/** Backdates the stored access token so the next use must refresh it. */
export async function expireConnectionAccessToken({
  connectionId,
}: {
  connectionId: string;
}): Promise<void> {
  await assertConnectedToTestDatabase();

  await db
    .update(integrationConnection)
    .set({ accessTokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000) })
    .where(sql`${integrationConnection.id} = ${connectionId}`);
}
