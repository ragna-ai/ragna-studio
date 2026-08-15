// apps/api/src/services/email-provider.service.ts
//
// Small helper that turns a logged-in user into a ready-to-use
// `MailProvider` (docs/email/prd.md, "Auth and account connection"). Gmail
// access is granted through the existing account-linking flow
// (`linkSocial()` in apps/web with the `gmail.modify` scope), never through
// a dedicated email-connect OAuth flow of our own. This file is the only
// place in apps/api that touches better-auth's account/token API for email;
// email.service.ts and the worker only ever talk to the `MailProvider`
// interface built here.

import { auth } from '@repo/auth/server';
import { getAccountByUserIdAndProvider } from '@repo/database';
import { logger } from '@repo/logger';
import { createGmailProvider, type MailProvider } from '@repo/mail/provider';
import { tryCatch } from '@repo/utils';
import { BadRequestException, InternalServerErrorException } from '../exceptions';

const GOOGLE_PROVIDER_ID = 'google';

// Sensitive-scope identifier Google issues for `gmail.modify`. Stored
// space-separated on better-auth's `account.scope` at link time.
const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

export interface GoogleGmailScopeStatus {
  /** Whether the user has linked a Google account at all (any scope). */
  linked: boolean;
  /** Whether that linked account was granted `gmail.modify`. */
  hasGmailScope: boolean;
}

/**
 * Inspects the user's linked Google account (better-auth's `account` table)
 * without calling Google, so callers can 400 with a clear message before
 * ever attempting a Gmail request.
 */
export async function getGoogleGmailScopeStatus({
  userId,
}: {
  userId: string;
}): Promise<GoogleGmailScopeStatus> {
  const { error, data: account } = await tryCatch(() =>
    getAccountByUserIdAndProvider({ userId, providerId: GOOGLE_PROVIDER_ID }),
  );

  if (error !== null) {
    logger.error('Failed to load Google account', error);
    throw new InternalServerErrorException('Failed to load Google account');
  }

  if (!account) {
    return { linked: false, hasGmailScope: false };
  }

  const scopes = (account.scope ?? '').split(',').filter(Boolean);
  return { linked: true, hasGmailScope: scopes.includes(GMAIL_MODIFY_SCOPE) };
}

function assertGmailScope(status: GoogleGmailScopeStatus): void {
  if (!status.linked) {
    throw new BadRequestException(
      'Connect your Google account first, then connect Gmail from the email settings page',
    );
  }

  if (!status.hasGmailScope) {
    throw new BadRequestException(
      'Your Google account is missing Gmail access. Reconnect it and grant the Gmail permission',
    );
  }
}

/**
 * Builds a `GmailProvider` for a user, wired to better-auth's
 * auto-refreshing access-token API (`auth.api.getAccessToken`), the same
 * call social-post.service.ts uses for LinkedIn. Throws a clear
 * `BadRequestException` up front when the account isn't linked or lacks the
 * `gmail.modify` scope, instead of letting the first Gmail call fail with an
 * opaque 401.
 */
export async function getGmailProviderForUser({
  userId,
}: {
  userId: string;
}): Promise<MailProvider> {
  const scopeStatus = await getGoogleGmailScopeStatus({ userId });
  assertGmailScope(scopeStatus);

  return createGmailProvider({
    getAccessToken: async () => {
      const { error, data: token } = await tryCatch(() =>
        auth.api.getAccessToken({ body: { providerId: GOOGLE_PROVIDER_ID, userId } }),
      );

      if (error !== null || !token?.accessToken) {
        logger.error('Failed to get a valid Google access token', error);
        throw new InternalServerErrorException('Failed to get a valid Google access token');
      }

      return token.accessToken;
    },
  });
}
