// apps/api/src/services/email-provider.service.ts

import { getEmailAccountByUserId, getUserConnectionById } from '@repo/database';
import {
  ConnectionNeedsReauthError,
  ConnectionProviderMismatchError,
  ConnectionScopesMissingError,
  createIntegrationTokenGetter,
  getIntegration,
  type ProviderId,
} from '@repo/integrations';
import { logger } from '@repo/logger';
import { createMailProvider, type MailIntegrationId, type MailProvider } from '@repo/mail/provider';
import { tryCatch } from '@repo/utils';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';

const PROVIDER_DISPLAY_NAME: Record<ProviderId, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  linkedin: 'LinkedIn',
};

export const RECONNECT_MAILBOX_MESSAGE = 'Reconnect your mailbox';

function toMailboxConnectionException(error: unknown, integrationId: MailIntegrationId): Error {
  const providerName = PROVIDER_DISPLAY_NAME[getIntegration(integrationId).provider];

  if (error instanceof ConnectionNeedsReauthError) {
    return new ConflictException(RECONNECT_MAILBOX_MESSAGE);
  }
  if (error instanceof ConnectionProviderMismatchError) {
    return new BadRequestException(`This connection is not a ${providerName} account`);
  }
  if (error instanceof ConnectionScopesMissingError) {
    return new BadRequestException(
      `Your ${providerName} account is missing mailbox access. Reconnect it and grant the required permissions`,
    );
  }

  logger.error(`Failed to get a valid ${providerName} access token`, error);
  return new InternalServerErrorException(`Failed to get a valid ${providerName} access token`);
}

/** The token is resolved once per request, so a rejected connection fails before any mail call. */
async function buildMailProvider(
  connectionId: string,
  integrationId: MailIntegrationId,
): Promise<MailProvider> {
  const getAccessToken = createIntegrationTokenGetter({ connectionId, integrationId });
  const { error, data: accessToken } = await tryCatch(getAccessToken);

  if (error !== null || !accessToken) {
    throw toMailboxConnectionException(error, integrationId);
  }

  return createMailProvider({ integrationId, getAccessToken: () => Promise.resolve(accessToken) });
}

export async function getMailProviderForUser({
  userId,
}: {
  userId: string;
}): Promise<MailProvider> {
  const { error, data: account } = await tryCatch(() => getEmailAccountByUserId({ userId }));

  if (error !== null) {
    logger.error('Failed to load email account', error);
    throw new InternalServerErrorException('Failed to load email account');
  }

  if (!account) {
    throw new NotFoundException('Mailbox is not connected');
  }

  return buildMailProvider(account.connectionId, account.integrationId);
}

export interface MailConnectionRequest {
  userId: string;
  integrationId: MailIntegrationId;
  connectionId: string;
}

/** Connect path: no email_accounts row exists yet, so the connection comes from the request body. */
export async function getMailProviderForConnectRequest({
  userId,
  integrationId,
  connectionId,
}: MailConnectionRequest): Promise<MailProvider> {
  const connection = await getUserConnectionById({ id: connectionId, userId });
  if (!connection) {
    throw new NotFoundException('Connection not found');
  }

  return buildMailProvider(connection.id, integrationId);
}
