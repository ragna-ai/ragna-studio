// packages/mail/src/content/html-to-markdown.ts
//
// Markdown is the canonical representation for message bodies wherever an
// LLM or the user touches content (docs/email/prd.md, "Content pipeline").
// This is the single conversion point, and it's display-grade, not just
// LLM-grade: the web app renders received mail as this markdown through the
// Tiptap editor, which supports links, images, GFM tables, and task lists.
// Plain turndown already round-trips links/images; the gfm plugin adds
// table, strikethrough, and task-list support turndown's core doesn't have
// (dependency pre-approved for exactly this).
//
// Uses `@joplin/turndown-plugin-gfm`, not the original `turndown-plugin-gfm`:
// the original is unmaintained and its table rules crash on a `<table>`
// with zero `<tr>` rows (`node.rows[0]` is `undefined`, and `isHeadingRow`
// dereferences it unconditionally) — real newsletter/marketing HTML hits
// this constantly. Joplin's fork guards the same path (`tableShouldBeSkipped`
// treats a missing/rowless table as "skip"), same plugin API otherwise.
//
// Deliberately does no quote-stripping here — `textBody` is persisted as
// the full canonical markdown; stripping is a prompt-assembly concern, see
// `stripQuotedReply` / `formatThreadForPrompt`.
//
// Turndown's defaults don't drop <style>/<script>/<title> content — it has
// no notion of "non-visible" elements, so their raw text (entire email
// stylesheets, in practice) flattens straight into the markdown output.
// apps/webbrowser never hits this because it strips those elements from
// the live DOM before handing HTML to turndown; email HTML comes to us
// raw, so this package has to do the same removal itself. Also drops the
// common "preheader" trick (an inline-hidden element carrying preview text
// meant only for the inbox list, never the reader) on a best-effort basis:
// no CSS parsing, just a regex check for the couple of inline-style
// patterns real senders actually use for it.

import { gfm } from '@joplin/turndown-plugin-gfm';
import TurndownService from 'turndown';
import type { MailBody } from '../provider/mail-provider';

const NON_CONTENT_TAG_NAMES = new Set(['HEAD', 'STYLE', 'SCRIPT', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);
const HIDDEN_INLINE_STYLE_RE = /(?:^|;)\s*(?:display\s*:\s*none|mso-hide\s*:\s*all|max-height\s*:\s*0(?:px)?)\b/i;

const turndownService = new TurndownService();
turndownService.use(gfm);
turndownService.remove((node) => {
  if (NON_CONTENT_TAG_NAMES.has(node.nodeName)) {
    return true;
  }
  const style = node.getAttribute('style');
  return Boolean(style && HIDDEN_INLINE_STYLE_RE.test(style));
});

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html).trim();
}

/**
 * The ingest rule from the PRD: convert the HTML part when present, else
 * fall back to the text/plain part. One path, computed once at persist
 * time. Returns `null` when neither part yields any content.
 *
 * Resilient by design, unlike `htmlToMarkdown`: real-world email HTML is
 * frequently malformed in ways no turndown config fully guards against, and
 * this is the ingest boundary — a conversion failure here must degrade, not
 * fail the whole sync/classify job. Falls back to the text/plain part, then
 * to a naive tag-strip of the HTML as a last resort. Callers who want the
 * raw conversion (and its errors) should call `htmlToMarkdown` directly.
 */
export function toCanonicalMarkdown(body: Pick<MailBody, 'html' | 'text'>): string | null {
  const markdown = body.html ? convertHtmlResiliently(body.html, body.text) : (body.text ?? '').trim();
  return markdown ? markdown : null;
}

function convertHtmlResiliently(html: string, textFallback: string | null): string {
  try {
    return htmlToMarkdown(html);
  } catch {
    const text = textFallback?.trim();
    return text ? text : stripHtmlTags(html);
  }
}

// Last-resort fallback for toCanonicalMarkdown: also drop <head>/<style>/
// <script> *content* (not just tags), so this path can't reintroduce the
// same leaked-CSS problem the primary turndown config guards against above.
function stripHtmlTags(html: string): string {
  const withoutNoise = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ');

  return decodeHtmlEntities(withoutNoise.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}
