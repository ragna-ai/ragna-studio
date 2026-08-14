// packages/mail/src/content/reply-quote.ts
//
// Builds the quoted-reply markdown block the composer inserts below a
// user's reply, client-side, before sending (docs/email/prd.md, "Content
// pipeline" / "Reply quoting"): "On DATE, NAME wrote:" followed by the
// replied-to message's body as '> '-prefixed markdown lines. Plain
// markdown, not HTML — the composer is Tiptap and hydrates markdown
// directly; the API never builds or renders HTML for this.

import type { MailAddress } from '../provider/mail-provider';
import { formatMailAddress } from './mail-address-display';

export interface ReplyQuoteSourceMessage {
  from: MailAddress;
  date: Date;
  markdownBody: string;
}

export function buildReplyQuoteMarkdown(message: ReplyQuoteSourceMessage): string {
  const header = `On ${formatQuoteDate(message.date)}, ${formatMailAddress(message.from)} wrote:`;
  return `${header}\n\n${quoteLines(message.markdownBody)}`;
}

function quoteLines(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

// Server-local time; the API layer can pass a user-timezone-adjusted Date
// once accounts carry a timezone preference. Not needed for v1.
function formatQuoteDate(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
