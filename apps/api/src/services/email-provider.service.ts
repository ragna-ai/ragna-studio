// apps/api/src/services/email-provider.service.ts

import { auth } from '@repo/auth/server';
import { getAccountByUserIdAndProvider, getEmailAccountByUserId } from '@repo/database';
import { logger } from '@repo/logger';
import { createMailProvider, type MailProvider, type MailProviderKind } from '@repo/mail/provider';
import { tryCatch } from '@repo/utils';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';

// gmail maps to better-auth's 'google' social provider id.
const BETTER_AUTH_PROVIDER_ID: Record<MailProviderKind, string> = {
  gmail: 'google',
  microsoft: 'microsoft',
};

const PROVIDER_DISPLAY_NAME: Record<MailProviderKind, string> = {
  gmail: 'Google',
  microsoft: 'Microsoft',
};

const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

// account.scope may store these as full URIs or short names; hasOAuthScope below accepts both.
const MICROSOFT_MAIL_SCOPES = ['Mail.ReadWrite', 'Mail.Send'];

function hasOAuthScope(scopes: string[], shortName: string): boolean {
  const needle = shortName.toLowerCase();
  return scopes.some((scope) => {
    const lower = scope.toLowerCase();
    return lower === needle || lower.endsWith(`/${needle}`);
  });
}

export interface MailProviderScopeStatus {
  linked: boolean;
  hasRequiredScope: boolean;
}

// Reads account.scope directly instead of calling the provider, so callers can 400 before the first mail request.
export async function getMailProviderScopeStatus({
  userId,
  provider,
}: {
  userId: string;
  provider: MailProviderKind;
}): Promise<MailProviderScopeStatus> {
  const { error, data: account } = await tryCatch(() =>
    getAccountByUserIdAndProvider({ userId, providerId: BETTER_AUTH_PROVIDER_ID[provider] }),
  );

  if (error !== null) {
    logger.error(`Failed to load ${provider} account`, error);
    throw new InternalServerErrorException('Failed to load linked account');
  }

  if (!account) {
    return { linked: false, hasRequiredScope: false };
  }

  const scopes = (account.scope ?? '').split(',').filter(Boolean);
  const hasRequiredScope =
    provider === 'gmail'
      ? scopes.includes(GMAIL_MODIFY_SCOPE)
      : MICROSOFT_MAIL_SCOPES.every((scope) => hasOAuthScope(scopes, scope));

  return { linked: true, hasRequiredScope };
}

function assertProviderScope(provider: MailProviderKind, status: MailProviderScopeStatus): void {
  const name = PROVIDER_DISPLAY_NAME[provider];

  if (!status.linked) {
    throw new BadRequestException(
      `Connect your ${name} account first, then connect your mailbox from the email settings page`,
    );
  }

  if (!status.hasRequiredScope) {
    throw new BadRequestException(
      `Your ${name} account is missing mailbox access. Reconnect it and grant the required permissions`,
    );
  }
}

function buildMailProvider({
  userId,
  provider,
}: {
  userId: string;
  provider: MailProviderKind;
}): MailProvider {
  const betterAuthProviderId = BETTER_AUTH_PROVIDER_ID[provider];
  const name = PROVIDER_DISPLAY_NAME[provider];

  return createMailProvider({
    provider,
    getAccessToken: async () => {
      const { error, data: token } = await tryCatch(async () => {
        const account = await getAccountByUserIdAndProvider({
          userId,
          providerId: betterAuthProviderId,
        });
        if (!account) {
          throw new Error(`${name} account is no longer linked`);
        }

        return auth.api.getAccessToken({ body: { accountId: account.id, userId } });
      });

      if (error !== null || !token?.accessToken) {
        logger.error(`Failed to get a valid ${name} access token`, error);
        throw new InternalServerErrorException(`Failed to get a valid ${name} access token`);
      }

      return token.accessToken;
    },
  });
}

async function assertScopeAndBuildProvider({
  userId,
  provider,
}: {
  userId: string;
  provider: MailProviderKind;
}): Promise<MailProvider> {
  const status = await getMailProviderScopeStatus({ userId, provider });
  assertProviderScope(provider, status);
  return buildMailProvider({ userId, provider });
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

  return assertScopeAndBuildProvider({ userId, provider: account.provider });
}

// Connect path: no email_accounts row exists yet, so the provider comes from the request body instead.
export async function getMailProviderForConnectRequest({
  userId,
  provider,
}: {
  userId: string;
  provider: MailProviderKind;
}): Promise<MailProvider> {
  return assertScopeAndBuildProvider({ userId, provider });
}
