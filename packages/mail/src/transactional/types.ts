import type { UserLocale } from '@repo/utils';

export interface TransactionalAction {
  label: string;
  url: string;
}

/** Everything the shared template needs, in one locale. The preheader is the first paragraph. */
export interface TransactionalContent {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: TransactionalAction;
  /** Why the recipient got this email. Completes "This email was sent to {address} …". */
  footerReason: string;
}

/** One content function per locale, so a missing language fails type-check. */
export type LocalizedContent<Variables> = Record<
  UserLocale,
  (variables: Variables) => TransactionalContent
>;
