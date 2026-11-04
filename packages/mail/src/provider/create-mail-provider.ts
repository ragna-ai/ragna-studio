import type { IntegrationIdIn } from '@repo/integrations/catalog';
import { createGmailProvider } from './gmail/gmail.provider';
import { createGraphProvider } from './graph/graph.provider';
import type { MailProvider, MailProviderOptions } from './mail-provider';

/** Every catalog integration in the mail category. */
export type MailIntegrationId = IntegrationIdIn<'mail'>;

type MailProviderFactory = (options: MailProviderOptions) => MailProvider;

const MAIL_PROVIDERS: Record<MailIntegrationId, MailProviderFactory> = {
  gmail: createGmailProvider,
  'outlook-mail': createGraphProvider,
};

export function isMailIntegrationId(value: string): value is MailIntegrationId {
  return Object.hasOwn(MAIL_PROVIDERS, value);
}

export interface CreateMailProviderOptions extends MailProviderOptions {
  integrationId: MailIntegrationId;
}

export function createMailProvider({
  integrationId,
  getAccessToken,
  sleep,
}: CreateMailProviderOptions): MailProvider {
  return MAIL_PROVIDERS[integrationId]({ getAccessToken, sleep });
}
