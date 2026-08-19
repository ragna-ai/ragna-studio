// packages/mail/src/content/html-to-text.ts
import { removeExcessiveWhitespace, truncate } from '@repo/utils';
import EmailReplyParser from 'email-reply-parser';
import { convert, type FormatCallback } from 'html-to-text';

const IMAGE_ALT_MAX_LENGTH = 160;
const IMAGE_PLACEHOLDER = '[image]';
const GENERIC_IMAGE_ALT_TEXT_PATTERN =
  /^(?:avatar|decorative|graphic|icon|image|img|logo|photo|picture|pixel|spacer|tracking pixel)$/i;

const FORWARDED_CONTENT_PATTERNS = [
  // Gmail style
  /(?:\r?\n|\r)?(?:-{3,}|_{3,})\s*Forwarded message\s*(?:-{3,}|_{3,})/i,
  // Simple forward markers
  /(?:\r?\n|\r)?(?:-{3,}|_{3,})\s*Forward(?:ed)?(?:\s*message)?(?:-{3,}|_{3,})/i,
  // Forwarded email header blocks
  /(?:^|\r?\n)From:\s*[^\r\n]+(?:\r?\n(?:Date|Sent|To|Cc|Bcc|Subject):\s*[^\r\n]+){2,}/im,
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

const formatImageAltText: FormatCallback = (elem, _walk, builder) => {
  builder.addInline(getImageText(elem.attribs?.alt), {
    noWordTransform: true,
  });
};

function getImageText(value: unknown) {
  if (typeof value !== 'string') return IMAGE_PLACEHOLDER;

  const altText = removeExcessiveWhitespace(value).trim();
  if (!altText) return IMAGE_PLACEHOLDER;
  if (GENERIC_IMAGE_ALT_TEXT_PATTERN.test(altText)) return IMAGE_PLACEHOLDER;

  return `[image: ${truncate(altText, IMAGE_ALT_MAX_LENGTH)}]`;
}

export type EmailToContentOptions = {
  maxLength?: number;
  includeReply?: boolean;
  includeForwarded?: boolean;
  includeLinkUrls?: boolean;
  includeImageAltText?: boolean;
};

// important to do before processing html emails
// this will cut down an email from 100,000 characters to 1,000 characters in some cases
export function htmlToText(
  html: string,
  {
    includeLinkUrls = false,
    includeImageAltText = false,
  }: Pick<EmailToContentOptions, 'includeLinkUrls' | 'includeImageAltText'> = {},
) {
  const text = convert(html, {
    wordwrap: 130,
    formatters: { imageAltText: formatImageAltText },
    selectors: [
      {
        selector: 'a',
        options: includeLinkUrls ? { hideLinkHrefIfSameAsText: true } : { ignoreHref: true },
      },
      {
        selector: 'img',
        format: includeImageAltText ? 'imageAltText' : 'skip',
      },
    ],
  });

  return text;
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
  {
    maxLength = 2000,
    includeReply = false,
    includeForwarded = false,
    includeLinkUrls = false,
    includeImageAltText = false,
  }: EmailToContentOptions = {},
): string | null {
  let emailText = '';

  if (body.htmlBody?.trim()) {
    emailText = htmlToText(body.htmlBody, {
      includeLinkUrls,
      includeImageAltText,
    });
  } else if (body.textBody?.trim()) {
    emailText = body.textBody;
  } else {
    return null;
  }

  if (includeReply !== true) {
    emailText = parseReply(emailText);
  }

  if (includeForwarded !== true) {
    emailText = stripForwardedContent(emailText);
  }

  emailText = removeExcessiveWhitespace(emailText);

  return maxLength ? truncate(emailText, maxLength) : emailText;
}
