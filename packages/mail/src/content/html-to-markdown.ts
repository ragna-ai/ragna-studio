import { logger } from '@repo/logger';
import { htmlToMarkdown as convertWithMdream } from 'mdream';
import type { MailBody } from '../provider/mail-provider';
import { EXCLUDED_SELECTORS } from './excluded-selectors';

/**
 * Converts HTML to GFM markdown for LLM input. Non-visible elements and inline
 * `data:` images are dropped, so style sheets and base64 payloads never leak in.
 */
export function htmlToMarkdown(html: string): string {
  return convertWithMdream(html, { filter: { exclude: EXCLUDED_SELECTORS } }).trim();
}

/**
 * Prefers the text/plain part when present, else converts the HTML part.
 * A failed conversion is logged and yields `null`, so ingest degrades instead of failing.
 */
export function toCanonicalText(body: Pick<MailBody, 'html' | 'text'>): string | null {
  const text = body.text?.trim();
  if (text) {
    return text;
  }
  if (!body.html) {
    return null;
  }

  try {
    return htmlToMarkdown(body.html) || null;
  } catch (error) {
    logger.error('Failed to convert email HTML to markdown', error);
    return null;
  }
}
