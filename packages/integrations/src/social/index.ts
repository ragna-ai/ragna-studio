import { getUserConnectionByProvider } from '@repo/database';
import { getIntegration } from '../catalog';
import { connectionServesIntegration } from '../oauth/scopes';
import { createIntegrationTokenGetter } from '../services/integration-connection.service';
import {
  createLinkedinPublisher,
  type LinkedinPublisherOptions,
} from './linkedin/linkedin.publisher';
import type { ResolvedLinkedinPublisher } from './social.types';

export * from './errors';
export * from './linkedin/linkedin.publisher';
export * from './social.types';

const LINKEDIN_INTEGRATION_ID = 'linkedin-posting';

export interface ResolveUserLinkedinPublisherParams {
  userId: string;
  /** Waits between vendor retries and status polls. Tests pass a recorder. */
  sleep?: LinkedinPublisherOptions['sleep'];
}

export async function resolveUserLinkedinPublisher({
  userId,
  sleep,
}: ResolveUserLinkedinPublisherParams): Promise<ResolvedLinkedinPublisher> {
  const integration = getIntegration(LINKEDIN_INTEGRATION_ID);
  const connection = await getUserConnectionByProvider({ userId, provider: integration.provider });
  if (!connection) return { status: 'not_connected' };
  if (connection.status === 'needs_reauth') {
    return { status: 'needs_reauth', connectionId: connection.id };
  }
  if (!connectionServesIntegration(connection, integration)) return { status: 'not_connected' };

  const publisher = createLinkedinPublisher({
    authorId: connection.externalAccountId,
    sleep,
    getAccessToken: createIntegrationTokenGetter({
      connectionId: connection.id,
      integrationId: LINKEDIN_INTEGRATION_ID,
    }),
  });
  return { status: 'ready', publisher, connection };
}
