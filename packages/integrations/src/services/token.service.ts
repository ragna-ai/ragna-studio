import { decryptSecret, encryptSecret } from '@repo/crypto';
import {
  getConnectionById,
  markConnectionNeedsReauth,
  withLockedConnection,
  type IntegrationConnection,
} from '@repo/database';
import { logger } from '@repo/logger';
import { enqueueNotification } from '@repo/queue';
import { tryCatch } from '@repo/utils';
import { ConnectionNeedsReauthError } from '../errors';
import { isGrantRejectedError } from '../oauth/oauth-client';
import { getProviderAdapter } from '../providers';

const MIN_TOKEN_VALIDITY_MS = 60_000;

type RefreshOutcome = { kind: 'token'; accessToken: string } | { kind: 'reauth'; reason: string };

function readUsableToken(connection: IntegrationConnection): string | null {
  if (!connection.accessToken) return null;

  const expiresAt = connection.accessTokenExpiresAt;
  if (expiresAt && expiresAt.getTime() - Date.now() < MIN_TOKEN_VALIDITY_MS) return null;

  return decryptSecret(connection.accessToken);
}

async function refreshUnderLock(connectionId: string): Promise<RefreshOutcome> {
  return withLockedConnection({
    connectionId,
    run: async (connection, saveTokens): Promise<RefreshOutcome> => {
      if (!connection || connection.status === 'needs_reauth') {
        return { kind: 'reauth', reason: 'connection_unavailable' };
      }

      const usableToken = readUsableToken(connection);
      if (usableToken) return { kind: 'token', accessToken: usableToken };

      if (!connection.refreshToken) return { kind: 'reauth', reason: 'no_refresh_token' };

      const refreshToken = decryptSecret(connection.refreshToken);
      const { error, data: tokens } = await tryCatch(() =>
        getProviderAdapter(connection.provider).refresh(refreshToken),
      );

      if (isGrantRejectedError(error)) {
        return { kind: 'reauth', reason: 'grant_rejected' };
      }
      if (error !== null || !tokens) {
        throw error ?? new Error('Token refresh returned nothing');
      }

      await saveTokens({
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes.length > 0 ? tokens.scopes : undefined,
      });
      return { kind: 'token', accessToken: tokens.accessToken };
    },
  });
}

async function flagNeedsReauth(connection: IntegrationConnection, reason: string): Promise<void> {
  const changed = await markConnectionNeedsReauth({ id: connection.id, reason });
  if (!changed) return;

  const recipientId = connection.userId ?? connection.createdByUserId;
  if (!recipientId) return;

  const { error } = await tryCatch(() =>
    enqueueNotification({
      userId: recipientId,
      type: 'integration_needs_reauth',
      data: { connectionId: connection.id, provider: connection.provider },
    }),
  );
  if (error !== null) {
    logger.error('Failed to notify about a connection that needs reauth', error);
  }
}

export interface GetConnectionAccessTokenParams {
  connectionId: string;
}

/**
 * The only way to get a provider token. Refreshes under a lock shared by API and worker.
 * Throws ConnectionNeedsReauthError once the provider rejects the grant.
 */
export async function getConnectionAccessToken({
  connectionId,
}: GetConnectionAccessTokenParams): Promise<string> {
  const connection = await getConnectionById({ id: connectionId });
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`);
  }
  if (connection.status === 'needs_reauth') {
    throw new ConnectionNeedsReauthError(connectionId);
  }

  const usableToken = readUsableToken(connection);
  if (usableToken) return usableToken;

  const outcome = await refreshUnderLock(connectionId);
  if (outcome.kind === 'token') return outcome.accessToken;

  await flagNeedsReauth(connection, outcome.reason);
  throw new ConnectionNeedsReauthError(connectionId);
}
