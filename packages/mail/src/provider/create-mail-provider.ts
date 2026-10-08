import { createGmailProvider } from './gmail/gmail.provider';
import { createGraphProvider } from './graph/graph.provider';
import type { MailProvider } from './mail-provider';

export type MailProviderKind = 'gmail' | 'microsoft';

export interface CreateMailProviderOptions {
  provider: MailProviderKind;
  /** Resolves a fresh, valid OAuth access token; the provider does not refresh or cache tokens. */
  getAccessToken: () => Promise<string>;
}

export function createMailProvider({
  provider,
  getAccessToken,
}: CreateMailProviderOptions): MailProvider {
  if (provider === 'gmail') {
    return createGmailProvider({ getAccessToken });
  }

  return createGraphProvider({ getAccessToken });
}
