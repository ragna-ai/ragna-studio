// packages/mail/src/content/html-to-markdown.ts
//
// The canonical LLM-facing representation for message bodies prefers the
// sender's plain-text part, falling back to a markdown conversion of the
// HTML part (see `toCanonicalText`). Received-mail display uses a
// sanitized HTML iframe instead (see specs/email/html-content-change-request.md).
//
// Uses `@truto/turndown-plugin-gfm`, not the original: the original crashes
// on a `<table>` with zero `<tr>` rows, which real newsletter HTML hits
// constantly.
//
// Turndown has no notion of "non-visible" elements, so raw <style>/<script>
// text (entire email stylesheets, in practice) would otherwise flatten
// straight into the output. Also drops the "preheader" trick (a
// display:none element carrying inbox-preview text) via regex, best-effort.

import { gfm } from '@truto/turndown-plugin-gfm';
import TurndownService from 'turndown';
import type { MailBody } from '../provider/mail-provider';
import { decodeHtmlEntities } from './html-entities';

const NON_CONTENT_TAG_NAMES = new Set(['HEAD', 'STYLE', 'SCRIPT', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);
const HIDDEN_INLINE_STYLE_RE =
  /(?:^|;)\s*(?:display\s*:\s*none|mso-hide\s*:\s*all|max-height\s*:\s*0(?:px)?)\b/i;

const turndownService = new TurndownService();
turndownService.use(gfm);
turndownService.remove((node) => {
  if (NON_CONTENT_TAG_NAMES.has(node.nodeName)) {
    return true;
  }
  const style = node.getAttribute('style');
  return Boolean(style && HIDDEN_INLINE_STYLE_RE.test(style));
});
// Default image rule inlines `src` verbatim; a `data:` URI image (embedded
// newsletter art/logos) would dump its whole base64 payload into the
// markdown, sometimes hundreds of KB, so those get placeholdered instead.
turndownService.addRule('stripDataUriImages', {
  filter: (node) => node.nodeName === 'IMG' && (node.getAttribute('src') ?? '').startsWith('data:'),
  replacement: () => '[image]',
});

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html).trim();
}

/**
 * Prefers the text/plain part when present (nothing to convert or leak),
 * else converts HTML. Falls back to a naive tag-strip if conversion throws,
 * since real-world email HTML is often malformed and this is the ingest
 * boundary: a failure here must degrade, not fail the sync/classify job.
 */
export function toCanonicalText(body: Pick<MailBody, 'html' | 'text'>): string | null {
  const text = body.text?.trim();
  if (text) {
    return text;
  }

  const markdown = body.html ? convertHtmlResiliently(body.html) : '';
  return markdown ? markdown : null;
}

function convertHtmlResiliently(html: string): string {
  try {
    return htmlToMarkdown(html);
  } catch {
    return stripHtmlTags(html);
  }
}

// Also drops <head>/<style>/<script> *content*, not just the tags, so this
// fallback can't reintroduce the leaked-CSS problem turndown guards against.
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
