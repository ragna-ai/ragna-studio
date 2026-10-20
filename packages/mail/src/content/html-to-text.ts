// packages/mail/src/content/html-to-text.ts
import { logger } from '@repo/logger';
import { removeExcessiveWhitespace, truncate } from '@repo/utils';
import EmailReplyParser from 'email-reply-parser';
import { htmlToMarkdown as convertWithMdream } from 'mdream';
import { EXCLUDED_SELECTORS } from './excluded-selectors';

const WORD_WRAP_WIDTH = 130;
// email-reply-parser's header regexes are quadratic on pathological input, so it
// only ever sees this much text. Twice the largest caller maxLength (drafts).
const MAX_PARSED_TEXT_LENGTH = 20_000;

// The lookbehinds and `:[^\r\n]+` keep matching linear: without them a long
// run of dashes or spaces in a long email backtracks in quadratic time.
const FORWARDED_CONTENT_PATTERNS = [
  // Gmail style
  /(?:\r?\n|\r)?(?<![-_])(?:-{3,}|_{3,})\s*Forwarded message\s*(?:-{3,}|_{3,})/i,
  // Simple forward markers
  /(?:\r?\n|\r)?(?<![-_])(?:-{3,}|_{3,})\s*Forward(?:ed)?(?:\s*message)?(?:-{3,}|_{3,})/i,
  // Forwarded email header blocks
  /(?:^|\r?\n)From:[^\r\n]+(?:\r?\n(?:Date|Sent|To|Cc|Bcc|Subject):[^\r\n]+){2,}/im,
  // iOS/Mac style
  /(?:\r?\n|\r)?Begin forwarded message:/im,
  // Outlook style
  /(?:\r?\n|\r)?Original Message/i,
];

export function stripForwardedContent(text: string): string {
  for (const pattern of FORWARDED_CONTENT_PATTERNS) {
    const parts = text.split(pattern);
    if (parts.length > 1) {
      // Take content before the forward marker and clean it
      return removeExcessiveWhitespace(parts[0]);
    }
  }

  return text;
}

export type EmailToContentOptions = {
  maxLength?: number;
  includeReply?: boolean;
  includeForwarded?: boolean;
};

/**
 * Flattens HTML to plain text, dropping images and link targets. Do this before
 * processing HTML emails: it cuts a 100,000 character email down to around 1,000
 * in some cases. A failed conversion is logged and yields an empty string.
 */
export function htmlToText(html: string): string {
  try {
    return convertWithMdream(html, {
      format: 'text',
      wrapWidth: WORD_WRAP_WIDTH,
      filter: { exclude: [...EXCLUDED_SELECTORS, 'img'] },
    }).trim();
  } catch (error) {
    logger.error('Failed to convert email HTML to text', error);
    return '';
  }
}

export function parseReply(plainText: string) {
  const parser = new EmailReplyParser().read(plainText);
  const result = parser.getVisibleText();
  return result;
}

export interface EmailBody {
  textBody: string | null;
  htmlBody: string | null;
}

export function emailBodyToText(
  body: EmailBody,
  { maxLength = 2000, includeReply = false, includeForwarded = false }: EmailToContentOptions = {},
): string | null {
  let emailText = '';

  if (body.htmlBody?.trim()) {
    emailText = htmlToText(body.htmlBody);
  } else if (body.textBody?.trim()) {
    emailText = body.textBody;
  } else {
    return null;
  }

  emailText = removeExcessiveWhitespace(emailText).slice(0, MAX_PARSED_TEXT_LENGTH);

  if (includeReply !== true) {
    emailText = parseReply(emailText);
  }

  if (includeForwarded !== true) {
    emailText = stripForwardedContent(emailText);
  }

  emailText = removeExcessiveWhitespace(emailText);

  return maxLength ? truncate(emailText, maxLength) : emailText;
}
