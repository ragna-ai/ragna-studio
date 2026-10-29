// apps/api/src/services/email-provider.service.ts

import {
  getEmailAccountByUserId,
  getUserConnectionById,
  type IntegrationConnection,
} from '@repo/database';
import {
  ConnectionNeedsReauthError,
  coversIntegration,
  getConnectionAccessToken,
  getIntegration,
  type IntegrationId,
  type ProviderId,
} from '@repo/integrations';
import { logger } from '@repo/logger';
import { createMailProvider, type MailProvider, type MailProviderKind } from '@repo/mail/provider';
import { tryCatch } from '@repo/utils';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';

const MAIL_INTEGRATION_ID: Record<MailProviderKind, IntegrationId> = {
  gmail: 'gmail',
  microsoft: 'outlook-mail',
};

const CONNECTION_PROVIDER_ID: Record<MailProviderKind, ProviderId> = {
  gmail: 'google',
  microsoft: 'microsoft',
};

const PROVIDER_DISPLAY_NAME: Record<MailProviderKind, string> = {
  gmail: 'Google',
  microsoft: 'Microsoft',
};

export const RECONNECT_MAILBOX_MESSAGE = 'Reconnect your mailbox';

/** The provider token is resolved once per request, so a rejected connection fails before any mail call. */
async function buildMailProvider({
  connectionId,
  provider,
}: {
  connectionId: string;
  provider: MailProviderKind;
}): Promise<MailProvider> {
  const { error, data: accessToken } = await tryCatch(() =>
    getConnectionAccessToken({ connectionId }),
  );

  if (error instanceof ConnectionNeedsReauthError) {
    throw new ConflictException(RECONNECT_MAILBOX_MESSAGE);
  }
  if (error !== null || !accessToken) {
    logger.error(`Failed to get a valid ${PROVIDER_DISPLAY_NAME[provider]} access token`, error);
    throw new InternalServerErrorException(
      `Failed to get a valid ${PROVIDER_DISPLAY_NAME[provider]} access token`,
    );
  }

  return createMailProvider({ provider, getAccessToken: () => Promise.resolve(accessToken) });
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

  return buildMailProvider({ connectionId: account.connectionId, provider: account.provider });
}

export interface MailConnectionRequest {
  userId: string;
  provider: MailProviderKind;
  connectionId: string;
}

function assertConnectionFitsMailbox(
  connection: IntegrationConnection,
  provider: MailProviderKind,
): void {
  if (connection.provider !== CONNECTION_PROVIDER_ID[provider]) {
    throw new BadRequestException(
      `This connection is not a ${PROVIDER_DISPLAY_NAME[provider]} account`,
    );
  }

  if (connection.status === 'needs_reauth') {
    throw new ConflictException(RECONNECT_MAILBOX_MESSAGE);
  }

  if (!coversIntegration(connection.scopes, getIntegration(MAIL_INTEGRATION_ID[provider]))) {
    throw new BadRequestException(
      `Your ${PROVIDER_DISPLAY_NAME[provider]} account is missing mailbox access. Reconnect it and grant the required permissions`,
    );
  }
}

/** Connect path: no email_accounts row exists yet, so the connection comes from the request body. */
export async function getMailProviderForConnectRequest({
  userId,
  provider,
  connectionId,
}: MailConnectionRequest): Promise<MailProvider> {
  const connection = await getUserConnectionById({ id: connectionId, userId });
  if (!connection) {
    throw new NotFoundException('Connection not found');
  }

  assertConnectionFitsMailbox(connection, provider);
  return buildMailProvider({ connectionId: connection.id, provider });
}
