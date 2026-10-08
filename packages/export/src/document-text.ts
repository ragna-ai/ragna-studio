import { asMarkedToken, flattenInline, parseMarkdownTokens } from './markdown-tokens';
import type { InlineSpan, Token, Tokens } from './markdown-tokens';
import type { DocumentExport, ExportFile } from './types';

const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

// Links render as "text (url)";
// every other style (bold/italic/code) is
// formatting the text writer intentionally drops.
function spansToText(spans: InlineSpan[]): string {
  return spans.map((span) => (span.linkHref ? `${span.text} (${span.linkHref})` : span.text)).join('');
}

// A list item's own text lives in its `text`/`paragraph` content tokens; a
// nested list lives in a `list` token alongside them (marked.js puts both in
// `item.tokens` for a loose list item).
function listItemText(item: Tokens.ListItem): string {
  return item.tokens
    .filter((token): token is Tokens.Text | Tokens.Paragraph => token.type === 'text' || token.type === 'paragraph')
    .map((token) => spansToText(flattenInline(token.tokens)))
    .join(' ');
}

function listItemLines(list: Tokens.List, item: Tokens.ListItem, index: number, depth: number): string[] {
  const marker = list.ordered ? `${(typeof list.start === 'number' ? list.start : 1) + index}.` : '-';
  const indent = '  '.repeat(depth);
  const nestedLists = item.tokens.filter((token): token is Tokens.List => token.type === 'list');

  return [
    `${indent}${marker} ${listItemText(item)}`,
    ...nestedLists.flatMap((nested) => listLines(nested, depth + 1)),
  ];
}

// No trailing blank line here, unlike the other block renderers: a list is
// only ever "done" once its top-level `blockLines` case appends one, so a
// nested list (recursing through this, not `blockLines`) doesn't inject a
// blank line in the middle of its parent's items.
function listLines(list: Tokens.List, depth: number): string[] {
  return list.items.flatMap((item, index) => listItemLines(list, item, index, depth));
}

function tableLines(table: Tokens.Table): string[] {
  const headerLine = table.header.map((cell) => spansToText(flattenInline(cell.tokens))).join(' | ');
  const rowLines = table.rows.map((row) =>
    row.map((cell) => spansToText(flattenInline(cell.tokens))).join(' | '),
  );

  return [headerLine, '-'.repeat(headerLine.length), ...rowLines];
}

// Walks one block-level token into plain-text lines. `depth` only matters
// for (nested) list items; every other block ignores it.
function blockLines(rawToken: Token, depth = 0): string[] {
  const token = asMarkedToken(rawToken);

  switch (token.type) {
    case 'heading':
      return ['', spansToText(flattenInline(token.tokens)), ''];
    case 'paragraph':
    case 'text':
      return [spansToText(flattenInline(token.tokens)), ''];
    case 'code':
      return [token.text, ''];
    case 'blockquote':
      // `.split('\n')` guards against a hard break (`br`) inside the quote:
      // without it, only the first physical line would get the `>` prefix.
      return [
        ...token.tokens
          .flatMap((child) => blockLines(child, depth))
          .flatMap((line) => line.split('\n'))
          .map((line) => `> ${line}`.trimEnd()),
        '',
      ];
    case 'list':
      return [...listLines(token, depth), ''];
    case 'hr':
      return ['---', ''];
    case 'table':
      return [...tableLines(token), ''];
    case 'space':
    case 'def':
    case 'html':
      return [];
    default:
      // Unsupported block token: degrade to its raw markdown, never an error.
      return token.raw.trim() ? [token.raw.trim(), ''] : [];
  }
}

/**
 * Plain-text writer for documents:
 * a token walk that strips formatting but
 * keeps structure (headings, list markers, verbatim code blocks, links as
 * "text (url)"). An empty document still exports a title-only file.
 */
export async function toDocumentText({ title, markdown }: DocumentExport): Promise<ExportFile> {
  const tokens = parseMarkdownTokens(markdown);
  const lines = [title, '', ...tokens.flatMap((token) => blockLines(token))];

  const bytes = new TextEncoder().encode(lines.join('\n').trimEnd() + '\n');

  return { bytes, contentType: TEXT_CONTENT_TYPE };
}
