// packages/mail/src/content/html-to-text.ts
//
// Produces the MIME `text/plain` sibling for an HTML message body
// (docs/email/html-content-change-request.md, "email_drafts: content
// becomes HTML, new text column"). Needed by the two draft producers that
// never touch a browser and so have no Tiptap instance to call
// `editor.getText()` on: the AI draft push (apps/worker) and the
// reply/forward quote seed (apps/api).
//
// Not attempting perfect plain-text fidelity (list bullets, table layout,
// etc.) — almost no recipient's client actually renders this part, mail
// clients show the HTML part instead. This is a compatibility floor, not a
// rendering target, the same bar `stripHtmlTags`'s resilient fallback in
// html-to-markdown.ts already sets for itself. No library: strip tags,
// decode entities, collapse whitespace.

import { decodeHtmlEntities } from './html-entities';

const NON_CONTENT_TAG_RE = /<(head|style|script|template)[\s\S]*?<\/\1>/gi;

// Block-level boundaries that should read as a line break once tags are
// gone, so the output isn't one unbroken run-on line. Applied before tag
// stripping, since after stripping there's nothing left to match on.
const BLOCK_BREAK_RE = /<\/(p|div|li|tr|h[1-6]|blockquote)>|<br\s*\/?>/gi;

export function htmlToText(html: string): string {
  const withoutNoise = html.replace(NON_CONTENT_TAG_RE, ' ');
  const withLineBreaks = withoutNoise.replace(BLOCK_BREAK_RE, '\n');
  const withoutTags = withLineBreaks.replace(/<[^>]*>/g, ' ');

  return collapseWhitespace(decodeHtmlEntities(withoutTags));
}

// Collapses runs of horizontal whitespace but keeps the paragraph/line
// breaks `htmlToText` inserted, and caps blank-line runs at one so
// deeply-nested block markup doesn't blow the output up into mostly empty
// lines.
function collapseWhitespace(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
