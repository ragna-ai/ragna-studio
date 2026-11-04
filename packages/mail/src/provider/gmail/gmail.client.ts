// packages/mail/src/provider/gmail/gmail.client.ts
//
// Gmail REST API v1 on the shared vendor client, which owns auth, retries and error mapping.
// Callers interpret a 404 where it's meaningful (e.g. `users.history.list` on an expired cursor).

import { createVendorClient, googleApi, type VendorClient } from '@repo/integrations/http';
import type { MailProviderOptions } from '../mail-provider';

const GMAIL_API = googleApi({ name: 'Gmail', baseUrl: 'https://gmail.googleapis.com/gmail/v1' });

export function createGmailClient(options: MailProviderOptions): VendorClient {
  return createVendorClient(GMAIL_API, {
    getAccessToken: options.getAccessToken,
    sleep: options.sleep,
  });
}
