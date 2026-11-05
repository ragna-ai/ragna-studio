import { getUserConnectionByProvider } from '@repo/database';
import { getIntegration, type CloudDriveIntegrationId } from '../catalog';
import { connectionServesIntegration } from '../oauth/scopes';
import { createIntegrationTokenGetter } from '../services/integration-connection.service';
import type {
  CloudDriveProvider,
  CloudDriveProviderOptions,
  ResolvedCloudDrive,
} from './cloud-drive.types';
import { createGoogleDriveProvider } from './google/google-drive.provider';

export * from './cloud-drive.types';
export * from './errors';

export type CloudDriveProviderFactory = (options: CloudDriveProviderOptions) => CloudDriveProvider;

export const CLOUD_DRIVE_PROVIDERS: Record<CloudDriveIntegrationId, CloudDriveProviderFactory> = {
  'google-drive': createGoogleDriveProvider,
};

export interface CreateCloudDriveProviderOptions extends CloudDriveProviderOptions {
  integrationId: CloudDriveIntegrationId;
}

export function createCloudDriveProvider({
  integrationId,
  getAccessToken,
  sleep,
}: CreateCloudDriveProviderOptions): CloudDriveProvider {
  return CLOUD_DRIVE_PROVIDERS[integrationId]({ getAccessToken, sleep });
}

export interface ResolveUserCloudDriveParams {
  userId: string;
  integrationId: CloudDriveIntegrationId;
  /** Waits between vendor retries. Tests pass a recorder. */
  sleep?: CloudDriveProviderOptions['sleep'];
}

export async function resolveUserCloudDrive({
  userId,
  integrationId,
  sleep,
}: ResolveUserCloudDriveParams): Promise<ResolvedCloudDrive> {
  const integration = getIntegration(integrationId);
  const connection = await getUserConnectionByProvider({ userId, provider: integration.provider });
  if (!connection) return { status: 'not_connected' };
  if (connection.status === 'needs_reauth') {
    return { status: 'needs_reauth', connectionId: connection.id };
  }
  if (!connectionServesIntegration(connection, integration)) return { status: 'not_connected' };

  const provider = createCloudDriveProvider({
    integrationId,
    sleep,
    getAccessToken: createIntegrationTokenGetter({ connectionId: connection.id, integrationId }),
  });
  return { status: 'ready', provider, connectionId: connection.id };
}
