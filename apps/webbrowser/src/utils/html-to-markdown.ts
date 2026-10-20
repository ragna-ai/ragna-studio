import { htmlToMarkdown } from 'mdream';

export const MAX_MARKDOWN_LENGTH = 10_000;

/** Inline base64 images carry no text and would fill the length budget. */
const EXCLUDED_SELECTORS = ['img[src^="data:"]'];

/** Converts page HTML to markdown, capped at `MAX_MARKDOWN_LENGTH` characters. */
export function toMarkdown(bodyHtml: string): string {
  const markdown = htmlToMarkdown(bodyHtml, { filter: { exclude: EXCLUDED_SELECTORS } });
  const truncated =
    markdown.length > MAX_MARKDOWN_LENGTH ? markdown.slice(0, MAX_MARKDOWN_LENGTH) : markdown;
  return truncated.replace(/^\s*[\r\n]/gm, '');
}
