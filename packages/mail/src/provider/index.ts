// packages/mail/src/provider/index.ts

export * from './mail-provider';
export * from './errors';
export { GmailProvider, createGmailProvider } from './gmail/gmail.provider';
export { GraphProvider, createGraphProvider } from './graph/graph.provider';
export { createMailProvider, isMailIntegrationId } from './create-mail-provider';
export type { CreateMailProviderOptions, MailIntegrationId } from './create-mail-provider';
