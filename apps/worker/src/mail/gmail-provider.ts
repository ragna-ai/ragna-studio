// apps/worker/src/mail/gmail-provider.ts
//
// Bridges better-auth's stored Google OAuth tokens into a MailProvider for
// one connected mailbox. Every email job (sync/classify/draft) needs this,
// so it lives here instead of duplicated per processor.

import { auth } from '@repo/auth/server';
import type { EmailAccount } from '@repo/database';
import { createGmailProvider, type MailProvider } from '@repo/mail/provider';

export function getGmailProviderForAccount(account: EmailAccount): MailProvider {
  return createGmailProvider({
    getAccessToken: () => getGoogleAccessToken(account.userId),
  });
}

// Same call better-auth's server API exposes for LinkedIn's publish path
// (apps/api's social-post.service.ts): passing an explicit `userId` with no
// request/session headers resolves straight to that user's stored account
// and refreshes it if the access token is within 5s of expiry, no HTTP
// context required.
async function getGoogleAccessToken(userId: string): Promise<string> {
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: 'google', userId },
  });

  if (!accessToken) {
    throw new Error(`No Google access token available for user ${userId}`);
  }

  return accessToken;
}
