// packages/mail/src/content/reply-quote.ts
//
// Builds the quoted-reply HTML block stored alongside a draft's own
// `content`:
// "On DATE, NAME wrote:"
// followed by the replied-to message's sanitized HTML wrapped in a
// <blockquote>. Rendered read-only via EmailContentIframe in the compose UI,
// not hydrated into the editable Tiptap instance.
//
// Both apps/api (user reply/forward drafts, `createEmailDraftForUser`) and
// apps/worker (AI drafts, `pushDraftToGmail`) call `buildReplyQuoteHtml`, so
// the sanitize logic below is the one place that has to hold for every
// producer.

import type { MailAddress } from '../provider/mail-provider';
import { formatMailAddress } from './mail-address-display';
import { sanitizeQuotedHtml } from './sanitize-html';

export interface ReplyQuoteSourceMessage {
  from: MailAddress;
  date: Date;
  html: string;
}

export interface DraftContentWithQuote {
  content: string;
  text: string;
  quotedHtml: string | null;
  quotedText: string | null;
}

// The quote lives in its own `quotedHtml`/`quotedText` columns
// so the compose UI can render
// it read-only, separate from the user's own editable text. Both apps/api's
// send path and apps/worker's Gmail write-back rejoin the two at the edge,
// so this join has to be the one place that does it — same discipline as
// `buildReplyQuoteHtml` above.
export function joinDraftContentWithQuote({
  content,
  text,
  quotedHtml,
  quotedText,
}: DraftContentWithQuote): { html: string; text: string } {
  return {
    html: content + (quotedHtml ?? ''),
    text: text + (quotedText ?? ''),
  };
}

// No length cap: the quote used to be truncated here (10,000 chars, closing
// any tag left open at the cut) to protect the browser-side Tiptap editor
// from hanging on a pathologically large blob (2026-08-15 freeze bug).
// That guard is gone now that the quote renders
// read-only through EmailContentIframe instead of being parsed into the
// editor - the same sandboxed
// iframe already renders full, un-truncated message HTML of any size for
// the read pane.
export function buildReplyQuoteHtml(message: ReplyQuoteSourceMessage): string {
  const header = `<p>On ${formatQuoteDate(message.date)}, ${escapeHtml(formatMailAddress(message.from))} wrote:</p>`;
  return `${header}<blockquote>${sanitizeQuotedHtml(message.html)}</blockquote>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
