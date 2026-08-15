// packages/mail/src/content/html-entities.ts
//
// Shared by every hand-rolled HTML fallback stripper in this directory
// (html-to-markdown.ts's last-resort tag strip, html-to-text.ts): decodes
// the handful of entities real email HTML actually uses. Not a general
// HTML-entity table, just enough to make stripped output readable text
// instead of literal `&amp;`/`&nbsp;` runs.

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}
