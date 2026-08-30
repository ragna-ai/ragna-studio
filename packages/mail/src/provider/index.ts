// packages/mail/src/provider/index.ts

export * from './mail-provider';
export { GmailApiError, GmailProvider, createGmailProvider, isAuthGmailError } from './gmail/gmail.provider';
export type { GmailProviderOptions } from './gmail/gmail.provider';
