// apps/worker/src/mail/mail-provider.ts

import { auth } from '@repo/auth/server';
import { getAccountByUserIdAndProvider, type EmailAccount, type EmailProvider } from '@repo/database';
import { createMailProvider, type MailProvider } from '@repo/mail/provider';

const BETTER_AUTH_PROVIDER_ID: Record<EmailProvider, string> = {
  gmail: 'google',
  microsoft: 'microsoft',
};

export function getMailProviderForAccount(account: EmailAccount): MailProvider {
  return createMailProvider({
    provider: account.provider,
    getAccessToken: () => getProviderAccessToken(account.userId, account.provider),
  });
}

// Explicit userId resolves straight to the stored account, no HTTP context needed.
async function getProviderAccessToken(userId: string, provider: EmailProvider): Promise<string> {
  const providerId = BETTER_AUTH_PROVIDER_ID[provider];
  const linkedAccount = await getAccountByUserIdAndProvider({ userId, providerId });

  if (!linkedAccount) {
    throw new Error(`No ${providerId} account linked for user ${userId}`);
  }

  const { accessToken } = await auth.api.getAccessToken({
    body: { accountId: linkedAccount.id, userId },
  });

  if (!accessToken) {
    throw new Error(`No ${providerId} access token available for user ${userId}`);
  }

  return accessToken;
}
