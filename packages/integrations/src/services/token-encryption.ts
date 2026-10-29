import { decryptSecret, encryptSecret } from '@repo/crypto';
import type { IntegrationProviderId } from '@repo/database';

export type ConnectionTokenColumn = 'access_token' | 'refresh_token';

/** The fields that identify a connection row. A token only decrypts on the row it was written for. */
export interface ConnectionTokenOwner {
  userId: string | null;
  workspaceId: string | null;
  provider: IntegrationProviderId;
  externalAccountId: string;
}

export interface EncryptConnectionTokenParams {
  owner: ConnectionTokenOwner;
  column: ConnectionTokenColumn;
  token: string;
}

export interface DecryptConnectionTokenParams {
  owner: ConnectionTokenOwner;
  column: ConnectionTokenColumn;
  envelope: string;
}

function connectionTokenContext(
  owner: ConnectionTokenOwner,
  column: ConnectionTokenColumn,
): string {
  return JSON.stringify([
    'integration_connections',
    owner.userId,
    owner.workspaceId,
    owner.provider,
    owner.externalAccountId,
    column,
  ]);
}

export function encryptConnectionToken({
  owner,
  column,
  token,
}: EncryptConnectionTokenParams): string {
  return encryptSecret({ plaintext: token, context: connectionTokenContext(owner, column) });
}

export function decryptConnectionToken({
  owner,
  column,
  envelope,
}: DecryptConnectionTokenParams): string {
  return decryptSecret({ envelope, context: connectionTokenContext(owner, column) });
}
