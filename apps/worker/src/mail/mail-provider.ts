// apps/worker/src/mail/mail-provider.ts

import type { EmailAccount } from '@repo/database';
import { getConnectionAccessToken } from '@repo/integrations';
import { createMailProvider, type MailProvider } from '@repo/mail/provider';

export function getMailProviderForAccount(account: EmailAccount): MailProvider {
  return createMailProvider({
    provider: account.provider,
    getAccessToken: () => getConnectionAccessToken({ connectionId: account.connectionId }),
  });
}
