import { buildReplyQuoteMarkdown } from '@repo/mail/content';
import type { EmailMessageDetail } from '~/features/email/types';

/**
 * Builds the composer's initial markdown for a reply/reply-all/forward:
 * an empty line for the user's own text, then the quoted source message
 * (docs/email/prd.md, "Reply quoting"). Visible and editable like any other
 * composer content; the API never appends quotes server-side.
 */
export function buildInitialReplyContent(message: EmailMessageDetail): string {
  const quote = buildReplyQuoteMarkdown({
    from: { name: message.from.name ?? undefined, address: message.from.email },
    date: new Date(message.sentAt),
    // Optional chaining as a last line of defense, same reasoning as
    // EmailMessageItem.vue: `message` comes from the same thread-detail
    // cache a mailbox action's flags-only response merges into.
    markdownBody: message.body?.markdown ?? '',
  });
  return `\n\n${quote}`;
}

export function buildReplySubject(subject: string | null): string {
  if (!subject) return 'Re:';
  return subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
}

export function buildForwardSubject(subject: string | null): string {
  if (!subject) return 'Fwd:';
  return subject.toLowerCase().startsWith('fwd:') ? subject : `Fwd: ${subject}`;
}
