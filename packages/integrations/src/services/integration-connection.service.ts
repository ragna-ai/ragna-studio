import { getConnectionById } from '@repo/database';
import { getIntegration, type IntegrationId } from '../catalog';
import {
  ConnectionNeedsReauthError,
  ConnectionProviderMismatchError,
  ConnectionScopesMissingError,
} from '../errors';
import { coversIntegration } from '../oauth/scopes';
import { getConnectionAccessToken } from './token.service';

export interface IntegrationTokenGetterParams {
  connectionId: string;
  integrationId: IntegrationId;
}

async function assertConnectionServes({
  connectionId,
  integrationId,
}: IntegrationTokenGetterParams): Promise<void> {
  const connection = await getConnectionById({ id: connectionId });
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`);
  }

  const integration = getIntegration(integrationId);
  if (connection.provider !== integration.provider) {
    throw new ConnectionProviderMismatchError(connectionId, integration.provider);
  }
  if (connection.status === 'needs_reauth') {
    throw new ConnectionNeedsReauthError(connectionId);
  }
  if (!coversIntegration(connection.scopes, integration)) {
    throw new ConnectionScopesMissingError(connectionId, integrationId);
  }
}

/**
 * The one way a capability (mail, files, ...) gets a token for a connection. The first call checks
 * the connection belongs to the integration's provider, is not waiting for a reconnect and holds
 * the integration's scopes. Every call returns a valid token, refreshed when needed.
 *
 * Call it once up front to fail before any vendor call, or hand it to a vendor client as-is.
 */
export function createIntegrationTokenGetter(
  params: IntegrationTokenGetterParams,
): () => Promise<string> {
  let checked: Promise<void> | undefined;

  return async () => {
    checked ??= assertConnectionServes(params);
    await checked;
    return getConnectionAccessToken({ connectionId: params.connectionId });
  };
}
