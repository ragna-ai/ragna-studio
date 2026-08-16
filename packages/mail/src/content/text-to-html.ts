// packages/mail/src/content/text-to-html.ts
//
// Renders a genuinely plain-text message body as an HTML fragment, for the
// rare quote fallback where a replied-to message has no HTML part at all
// (see resolveMessageHtmlForQuote in apps/api and pushDraftToGmail in
// apps/worker). Deliberately not `markdownToHtml`: this text was never
// markdown, so running it through a markdown parser would misread a
// sender's own `#`/`-`/`>`-prefixed lines as syntax and collapse line
// breaks into a single paragraph.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function textToHtml(text: string): string {
  return `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
}
