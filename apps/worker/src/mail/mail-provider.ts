// apps/worker/src/mail/mail-provider.ts

import type { EmailAccount } from '@repo/database';
import { createIntegrationTokenGetter } from '@repo/integrations';
import { createMailProvider, type MailProvider } from '@repo/mail/provider';

export function getMailProviderForAccount(account: EmailAccount): MailProvider {
  return createMailProvider({
    integrationId: account.integrationId,
    getAccessToken: createIntegrationTokenGetter({
      connectionId: account.connectionId,
      integrationId: account.integrationId,
    }),
  });
}
