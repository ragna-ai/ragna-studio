// packages/mail/src/provider/index.ts

export * from './mail-provider';
export * from './errors';
export { GmailApiError, GmailProvider, createGmailProvider } from './gmail/gmail.provider';
export type { GmailProviderOptions } from './gmail/gmail.provider';
export { GraphApiError, GraphProvider, createGraphProvider } from './graph/graph.provider';
export type { GraphProviderOptions } from './graph/graph.provider';
export { createMailProvider } from './create-mail-provider';
export type { CreateMailProviderOptions, MailProviderKind } from './create-mail-provider';
