// packages/mail/src/content/reply-quote.ts
//
// Builds the quoted-reply markdown block the composer inserts below a
// user's reply, client-side, before sending (docs/email/prd.md, "Content
// pipeline" / "Reply quoting"): "On DATE, NAME wrote:" followed by the
// replied-to message's body as '> '-prefixed markdown lines. Plain
// markdown, not HTML — the composer is Tiptap and hydrates markdown
// directly; the API never builds or renders HTML for this.
//
// Both apps/api (user reply/forward drafts) and apps/worker (AI drafts) call
// `buildReplyQuoteMarkdown`, so the wrap/cap logic below is the one place
// that has to hold for every producer.

import type { MailAddress } from '../provider/mail-provider';
import { formatMailAddress } from './mail-address-display';

export interface ReplyQuoteSourceMessage {
  from: MailAddress;
  date: Date;
  markdownBody: string;
}

// These two limits exist to protect a browser-side editor, not for
// aesthetics. A structureless HTML newsletter turndowns into one very long
// markdown line (one real message hit 80,520 characters, no whitespace to
// break on for long stretches); prefixing that straight into a quote and
// hydrating it into Tiptap hangs the browser's main thread indefinitely —
// "page unresponsive", no Vue warning, reproducible every time that thread
// is opened. Do not raise these without re-testing Tiptap hydration cost
// against a real multi-thousand-character line.
/** Longest a single quoted line is allowed to be before it gets hard-wrapped. */
export const QUOTE_LINE_WRAP_LENGTH = 1000;
/** Longest the total quoted body is allowed to be before it gets truncated. */
export const QUOTE_MAX_LENGTH = 10_000;

// How far back from `QUOTE_LINE_WRAP_LENGTH` to look for a space to break
// on, so a wrap doesn't land mid-word. Kept well below the wrap length so a
// line with no whitespace anywhere near the limit (a bare base64 blob, a
// long URL) still terminates in a bounded hard cut, never an open-ended
// search for a space that isn't there.
const WRAP_LOOKBACK = 200;

const TRIMMED_MARKER = '> … (quoted message trimmed)';

export function buildReplyQuoteMarkdown(message: ReplyQuoteSourceMessage): string {
  const header = `On ${formatQuoteDate(message.date)}, ${formatMailAddress(message.from)} wrote:`;
  return `${header}\n\n${quoteBody(message.markdownBody)}`;
}

function quoteBody(markdown: string): string {
  const quoted = quoteLines(wrapLongLines(markdown));
  const { text, truncated } = capBody(quoted);
  return truncated ? `${text}\n${TRIMMED_MARKER}` : text;
}

// Caps the length of the already-'> '-prefixed body, since that prefixed
// text is what actually gets hydrated into Tiptap; cuts at the last line
// break before the limit when there is one, so truncation never leaves a
// half-quoted line.
function capBody(quotedMarkdown: string): { text: string; truncated: boolean } {
  if (quotedMarkdown.length <= QUOTE_MAX_LENGTH) {
    return { text: quotedMarkdown, truncated: false };
  }

  const cut = quotedMarkdown.slice(0, QUOTE_MAX_LENGTH);
  const lastLineBreak = cut.lastIndexOf('\n');
  return { text: lastLineBreak > 0 ? cut.slice(0, lastLineBreak) : cut, truncated: true };
}

function wrapLongLines(markdown: string): string {
  return markdown.split('\n').map(wrapLine).join('\n');
}

function wrapLine(line: string): string {
  if (line.length <= QUOTE_LINE_WRAP_LENGTH) {
    return line;
  }

  const segments: string[] = [];
  let remaining = line;

  while (remaining.length > QUOTE_LINE_WRAP_LENGTH) {
    const breakAt = findWrapBreak(remaining);
    segments.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  segments.push(remaining);

  return segments.join('\n');
}

// Breaks at the last space within `WRAP_LOOKBACK` of the wrap limit, so
// whole words survive; falls back to a hard cut exactly at the limit when
// the line has no such space (e.g. a long token with no whitespace at all).
// Either way this advances by at least `QUOTE_LINE_WRAP_LENGTH -
// WRAP_LOOKBACK` characters per call, so `wrapLine`'s loop always
// terminates.
function findWrapBreak(line: string): number {
  const window = line.slice(0, QUOTE_LINE_WRAP_LENGTH);
  const lastSpaceIndex = window.lastIndexOf(' ');

  if (lastSpaceIndex >= QUOTE_LINE_WRAP_LENGTH - WRAP_LOOKBACK) {
    return lastSpaceIndex + 1;
  }
  return QUOTE_LINE_WRAP_LENGTH;
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
