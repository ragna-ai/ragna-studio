import {
  deleteConnectionById,
  deleteUserConnections,
  getUserConnectionByProvider,
  listUserConnections,
  upsertUserConnection,
  type IntegrationConnection,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import {
  integrationConnectionDtoSchema,
  type IntegrationConnectionDto,
  type IntegrationDefinition,
} from '../catalog';
import { mergeScopes, listCoveredIntegrationIds } from '../oauth/scopes';
import { getOAuthProvider } from '../providers';
import type { ExternalAccountProfile, TokenSet } from '../providers/provider.types';
import {
  decryptConnectionToken,
  encryptConnectionToken,
  type ConnectionTokenOwner,
} from './token-encryption';

export function toIntegrationConnectionDto(
  connection: IntegrationConnection,
): IntegrationConnectionDto {
  return integrationConnectionDtoSchema.parse({
    id: connection.id,
    provider: connection.provider,
    externalEmail: connection.externalEmail,
    displayName: connection.displayName,
    scopes: connection.scopes,
    integrations: listCoveredIntegrationIds(connection.provider, connection.scopes),
    status: connection.status,
    createdAt: connection.createdAt.toISOString(),
  });
}

export interface SaveUserConnectionGrantParams {
  organizationId: string;
  userId: string;
  integration: IntegrationDefinition;
  profile: ExternalAccountProfile;
  /** Plaintext tokens as the provider returned them. They are encrypted here. */
  tokens: TokenSet;
}

/**
 * Stores the user's connection for the provider. The refresh token and scopes of the same
 * external account survive a grant that does not repeat them.
 */
export async function saveUserConnectionGrant({
  organizationId,
  userId,
  integration,
  profile,
  tokens,
}: SaveUserConnectionGrantParams): Promise<IntegrationConnection> {
  const existing = await getUserConnectionByProvider({ userId, provider: integration.provider });
  const sameAccount = existing?.externalAccountId === profile.id;
  const keptScopes = sameAccount ? existing.scopes : [];
  const scopes =
    tokens.scopes.length > 0 ? tokens.scopes : mergeScopes(integration.scopes, keptScopes);
  const keptRefreshToken = sameAccount ? existing.refreshToken : null;
  const owner: ConnectionTokenOwner = {
    userId,
    workspaceId: null,
    provider: integration.provider,
    externalAccountId: profile.id,
  };

  return upsertUserConnection({
    organizationId,
    userId,
    provider: integration.provider,
    externalAccountId: profile.id,
    externalEmail: profile.email,
    displayName: profile.name,
    scopes,
    accessToken: encryptConnectionToken({
      owner,
      column: 'access_token',
      token: tokens.accessToken,
    }),
    refreshToken: tokens.refreshToken
      ? encryptConnectionToken({ owner, column: 'refresh_token', token: tokens.refreshToken })
      : keptRefreshToken,
    accessTokenExpiresAt: tokens.expiresAt,
  });
}

/** The refresh token revokes the whole grant, so it is preferred over the access token. */
function readRevocableToken(connection: IntegrationConnection): string | null {
  if (connection.refreshToken) {
    return decryptConnectionToken({
      owner: connection,
      column: 'refresh_token',
      envelope: connection.refreshToken,
    });
  }
  if (connection.accessToken) {
    return decryptConnectionToken({
      owner: connection,
      column: 'access_token',
      envelope: connection.accessToken,
    });
  }
  return null;
}

/** Asks the provider to drop the grant. A failure is logged: the row is deleted regardless. */
async function revokeGrantAtProvider(connection: IntegrationConnection): Promise<void> {
  const { error } = await tryCatch(async () => {
    const token = readRevocableToken(connection);
    if (token) await getOAuthProvider(connection.provider).revoke(token);
  });
  if (error !== null) {
    logger.error(`Failed to revoke the ${connection.provider} grant`, error);
  }
}

export async function removeConnection(connection: IntegrationConnection): Promise<void> {
  await revokeGrantAtProvider(connection);
  await deleteConnectionById({ id: connection.id });
}

/** Offboarding: revokes every connection of the user at its provider, then deletes them. */
export async function removeUserConnections({ userId }: { userId: string }): Promise<void> {
  const connections = await listUserConnections({ userId });
  await Promise.all(connections.map(revokeGrantAtProvider));
  await deleteUserConnections({ userId });
}
