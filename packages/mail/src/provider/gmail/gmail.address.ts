// packages/mail/src/provider/gmail/gmail.address.ts
//
// Parses RFC 5322 address-list headers (`From`, `To`, `Cc`, `Bcc`) into
// `MailAddress[]`, including RFC 2047 encoded-word decoding for display
// names (`=?UTF-8?B?...?=`). Hand-rolled rather than pulled from nodemailer's
// internal `addressparser` submodule, which isn't part of its public API
// surface and ships no types.

import type { MailAddress } from '../mail-provider';

const ENCODED_WORD_RE = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

export function parseAddressList(headerValue: string | null): MailAddress[] {
  if (!headerValue) {
    return [];
  }

  return splitTopLevelAddresses(headerValue)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseSingleAddress);
}

/** Splits on top-level commas only, ignoring commas inside quotes or `<...>`. */
function splitTopLevelAddresses(value: string): string[] {
  const entries: string[] = [];
  let current = '';
  let inQuotes = false;
  let angleDepth = 0;

  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char === '<') {
      angleDepth++;
    } else if (!inQuotes && char === '>') {
      angleDepth = Math.max(0, angleDepth - 1);
    }

    if (char === ',' && !inQuotes && angleDepth === 0) {
      entries.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    entries.push(current);
  }

  return entries;
}

function parseSingleAddress(entry: string): MailAddress {
  const match = entry.match(/^(.*)<([^<>]+)>$/);

  if (!match) {
    return { address: entry.trim() };
  }

  const rawName = match[1].trim().replace(/^"|"$/g, '');
  const name = decodeMimeWords(rawName);
  const address = match[2].trim();

  return name ? { name, address } : { address };
}

/** Decodes RFC 2047 encoded-words (`=?charset?B|Q?...?=`) found anywhere in `input`. */
export function decodeMimeWords(input: string): string {
  return input.replace(
    ENCODED_WORD_RE,
    (_match, charset: string, encoding: string, text: string) => {
      const bytes =
        encoding.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : decodeQuotedPrintable(text);

      try {
        return new TextDecoder(charset.toLowerCase()).decode(bytes);
      } catch {
        return bytes.toString('utf-8');
      }
    },
  );
}

function decodeQuotedPrintable(text: string): Buffer {
  const withSpaces = text.replace(/_/g, ' ');
  const bytes: number[] = [];

  for (let i = 0; i < withSpaces.length; i++) {
    const char = withSpaces[i];

    if (char === '=' && i + 2 < withSpaces.length) {
      bytes.push(Number.parseInt(withSpaces.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }

    bytes.push(withSpaces.charCodeAt(i));
  }

  return Buffer.from(bytes);
}
