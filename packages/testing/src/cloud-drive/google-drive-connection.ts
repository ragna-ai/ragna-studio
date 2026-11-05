import type { IntegrationId } from '@repo/integrations';
import type { IntegrationConnectionStatus } from '@repo/database';
import type { IntegrationConnection } from '@repo/database/schema';
import { seedIntegrationConnection } from '../integrations/connection-fixtures';

export interface SeedGoogleDriveConnectionParams {
  userId: string;
  /** Also enables Gmail on the same Google connection. */
  withGmail?: boolean;
  status?: IntegrationConnectionStatus;
}

/** The user's Google connection with Google Drive enabled and its scopes granted. */
export async function seedGoogleDriveConnection({
  userId,
  withGmail = false,
  status,
}: SeedGoogleDriveConnectionParams): Promise<IntegrationConnection> {
  const integrationIds: IntegrationId[] = withGmail ? ['gmail', 'google-drive'] : ['google-drive'];
  const { connection } = await seedIntegrationConnection({
    userId,
    provider: 'google',
    integrationIds,
    status,
  });
  return connection;
}
