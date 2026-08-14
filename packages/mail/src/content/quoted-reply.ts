// packages/mail/src/content/quoted-reply.ts
//
// Strips quoted reply chains from canonical markdown. Operates on markdown,
// not the source HTML: `formatThreadForPrompt` (the only caller) receives
// already-converted `markdownBody` strings, and stripping is a
// prompt-assembly step, not part of the stored canonical markdown (see
// html-to-markdown.ts). Two heuristics, chosen to match how turndown
// renders the common quote shapes:
//
// 1. Gmail/Outlook/etc. wrap history in `<blockquote>`, usually preceded by
//    an "On DATE, NAME wrote:" attribution line. Turndown renders the
//    blockquote as consecutive `>`-prefixed lines, so once we find that
//    attribution line we drop it and everything after.
// 2. Some clients omit the attribution line and just wrap history in a bare
//    `<blockquote>`. That still renders as a trailing run of `>`-prefixed
//    lines, so trim any such run left at the end.
//
// Best-effort: covers Gmail's own quoting and the common English "On ...
// wrote:" convention; unusual or heavily localized clients may leave
// residual quoted text.

const QUOTE_ATTRIBUTION_RE = /^>*\s*On\b[\s\S]{0,300}?\bwrote:\s*$/im;

export function stripQuotedReply(markdown: string): string {
  const truncated = truncateAtAttributionLine(markdown);
  return trimTrailingQuoteBlock(truncated).trimEnd();
}

function truncateAtAttributionLine(markdown: string): string {
  const match = markdown.match(QUOTE_ATTRIBUTION_RE);
  return match?.index === undefined ? markdown : markdown.slice(0, match.index);
}

function trimTrailingQuoteBlock(markdown: string): string {
  const lines = markdown.split('\n');
  let end = lines.length;

  while (end > 0 && isBlankOrQuoteLine(lines[end - 1])) {
    end--;
  }

  return lines.slice(0, end).join('\n');
}

function isBlankOrQuoteLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('>');
}
