// packages/mail/src/content/reply-quote.ts
//
// Builds the quoted-reply HTML block the composer inserts below a user's
// reply, before sending (docs/email/html-content-change-request.md,
// "Quoting: HTML blockquote replaces buildReplyQuoteMarkdown"): "On DATE,
// NAME wrote:" followed by the replied-to message's sanitized HTML wrapped
// in a <blockquote>. The composer is now the HTML-native Tiptap mode
// (`@repo/editor`'s `contentType: 'html'`), so this hydrates directly, no
// markdown round-trip.
//
// Both apps/api (user reply/forward drafts, `createEmailDraftForUser`) and
// apps/worker (AI drafts, `pushDraftToGmail`) call `buildReplyQuoteHtml`, so
// the sanitize/cap logic below is the one place that has to hold for every
// producer.

import type { MailAddress } from '../provider/mail-provider';
import { formatMailAddress } from './mail-address-display';
import { sanitizeQuotedHtml } from './sanitize-html';

export interface ReplyQuoteSourceMessage {
  from: MailAddress;
  date: Date;
  html: string;
}

// This limit exists to protect the browser-side editor, not for aesthetics.
// It's the HTML-shaped continuation of the 2026-08-15 freeze bug
// (docs/email/bugs.md): a structureless HTML newsletter turndowned into one
// 80,520-character markdown line with no whitespace to wrap on, and
// hydrating that straight into Tiptap hung the browser's main thread
// indefinitely. The equivalent HTML risk is a giant blob with no internal
// tag structure (one huge text node inside a single <div>) — sanitizing
// doesn't shrink that, so this cap and `truncateHtmlAtTagBoundary` below
// still have to do the work. Do not raise this without re-testing Tiptap
// hydration cost against a real multi-thousand-character blob.
/** Longest the sanitized quoted body is allowed to be before it gets truncated. */
export const QUOTE_MAX_LENGTH = 10_000;

const TRIMMED_MARKER_HTML = '<p><em>… (quoted message trimmed)</em></p>';

// Void/self-closing elements never open a nesting level, so the truncator's
// tag-depth tracker must not push them onto its stack — otherwise it would
// wait forever for a closing `</br>` that a serializer never emits.
const VOID_TAG_NAMES = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

export function buildReplyQuoteHtml(message: ReplyQuoteSourceMessage): string {
  const header = `<p>On ${formatQuoteDate(message.date)}, ${escapeHtml(formatMailAddress(message.from))} wrote:</p>`;
  return `${header}<blockquote>${buildQuotedBodyHtml(message.html)}</blockquote>`;
}

// Sanitizing first (not just for safety) also well-forms the HTML: DOMPurify
// re-serializes through its own parser, so by the time `truncateHtmlAtTagBoundary`
// walks it, tags are guaranteed to be properly matched and nested — the
// truncator only has to track depth, not recover from malformed markup.
function buildQuotedBodyHtml(html: string): string {
  const sanitized = sanitizeQuotedHtml(html);
  const { html: body, truncated } = truncateHtmlAtTagBoundary(sanitized, QUOTE_MAX_LENGTH);
  return truncated ? `${body}${TRIMMED_MARKER_HTML}` : body;
}

interface TruncateResult {
  html: string;
  truncated: boolean;
}

// Cuts well-formed HTML at the last point at or before `maxLength` that
// falls between two tokens (a full tag, or a chunk of text), never inside
// one, then closes every tag still open at that point so the result is
// always valid, self-contained HTML — no half-written attribute, no
// dangling unclosed `<blockquote>`/`<div>`/etc. for Tiptap to choke on.
function truncateHtmlAtTagBoundary(html: string, maxLength: number): TruncateResult {
  if (html.length <= maxLength) {
    return { html, truncated: false };
  }

  const tagRe = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?\/?>/g;
  const openTags: string[] = [];
  let output = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    const textBeforeTag = html.slice(cursor, match.index);
    if (output.length + textBeforeTag.length > maxLength) {
      output += textBeforeTag.slice(0, maxLength - output.length);
      return closeAndTrim(output, openTags);
    }
    output += textBeforeTag;

    const tag = match[0];
    if (output.length + tag.length > maxLength) {
      return closeAndTrim(output, openTags);
    }
    output += tag;
    trackTagDepth(tag, openTags);
    cursor = tagRe.lastIndex;
  }

  const trailingText = html.slice(cursor);
  output += trailingText.slice(0, Math.max(0, maxLength - output.length));
  return closeAndTrim(output, openTags);
}

function closeAndTrim(output: string, openTags: readonly string[]): TruncateResult {
  const closingTags = openTags
    .slice()
    .reverse()
    .map((name) => `</${name}>`)
    .join('');
  return { html: output + closingTags, truncated: true };
}

function trackTagDepth(tag: string, openTags: string[]): void {
  const nameMatch = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(tag);
  if (!nameMatch) {
    return;
  }
  const name = nameMatch[1].toLowerCase();
  if (VOID_TAG_NAMES.has(name) || tag.endsWith('/>')) {
    return;
  }

  const isClosingTag = tag.startsWith('</');
  if (!isClosingTag) {
    openTags.push(name);
    return;
  }

  // Sanitized input should always close its most recently opened tag, but
  // search from the top rather than assume it, so one unexpected mismatch
  // can't leave a stale entry that later corrupts the closing-tag order.
  const openIndex = openTags.lastIndexOf(name);
  if (openIndex !== -1) {
    openTags.splice(openIndex, 1);
  }
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
