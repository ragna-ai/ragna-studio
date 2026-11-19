import { htmlToMarkdown } from 'mdream';

export const MAX_MARKDOWN_LENGTH = 10_000;

/** Inline base64 images carry no text and would fill the length budget. */
const EXCLUDED_SELECTORS = ['img[src^="data:"]'];

export interface PageMarkdown {
  markdown: string;
  /** True when the page was longer than `MAX_MARKDOWN_LENGTH` and got cut off. */
  truncated: boolean;
}

/** Converts page HTML to markdown, capped at `MAX_MARKDOWN_LENGTH` characters. */
export function toMarkdown(bodyHtml: string): PageMarkdown {
  const markdown = htmlToMarkdown(bodyHtml, { filter: { exclude: EXCLUDED_SELECTORS } });
  const truncated = markdown.length > MAX_MARKDOWN_LENGTH;
  const capped = truncated ? markdown.slice(0, MAX_MARKDOWN_LENGTH) : markdown;
  return { markdown: capped.replace(/^\s*[\r\n]/gm, ''), truncated };
}
