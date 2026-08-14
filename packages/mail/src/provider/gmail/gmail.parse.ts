// packages/mail/src/provider/gmail/gmail.parse.ts
//
// Maps Gmail's `messages.get` / `threads.get` resource shape onto the
// provider-agnostic `MailMessageMetadata` / `MailMessage` types, including
// walking the MIME part tree for the body and attachment metadata. The
// provider does not sanitize HTML or fetch attachment bytes here; callers
// sanitize, and `getAttachment` fetches bytes on demand.

import type { MailAttachmentMeta, MailBody, MailMessage, MailMessageMetadata } from '../mail-provider';
import { parseAddressList } from './gmail.address';
import type { GmailHeader, GmailMessagePart, GmailMessageResource } from './gmail.types';

const LABEL_UNREAD = 'UNREAD';
const LABEL_STARRED = 'STARRED';

export function getHeaderValue(headers: GmailHeader[] | undefined, name: string): string | null {
  const header = headers?.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

export function toMailMessageMetadata(raw: GmailMessageResource): MailMessageMetadata {
  const headers = raw.payload?.headers;
  const labelIds = raw.labelIds ?? [];
  const [from] = parseAddressList(getHeaderValue(headers, 'From'));

  return {
    id: raw.id,
    threadId: raw.threadId,
    from: from ?? null,
    to: parseAddressList(getHeaderValue(headers, 'To')),
    cc: parseAddressList(getHeaderValue(headers, 'Cc')),
    bcc: parseAddressList(getHeaderValue(headers, 'Bcc')),
    subject: getHeaderValue(headers, 'Subject'),
    snippet: raw.snippet ?? '',
    date: new Date(Number(raw.internalDate)),
    labelIds,
    unread: labelIds.includes(LABEL_UNREAD),
    starred: labelIds.includes(LABEL_STARRED),
  };
}

export function toMailMessage(raw: GmailMessageResource): MailMessage {
  const metadata = toMailMessageMetadata(raw);
  const headers = raw.payload?.headers;

  return {
    ...metadata,
    body: raw.payload ? parseGmailPayload(raw.payload) : { text: null, html: null, attachments: [] },
    messageIdHeader: getHeaderValue(headers, 'Message-ID'),
    inReplyTo: getHeaderValue(headers, 'In-Reply-To'),
    references: parseReferencesHeader(getHeaderValue(headers, 'References')),
  };
}

function parseReferencesHeader(value: string | null): string[] {
  return value ? value.split(/\s+/).filter(Boolean) : [];
}

/** Recursively walks a MIME part tree, collecting the text/HTML bodies and attachment metadata. */
export function parseGmailPayload(payload: GmailMessagePart): MailBody {
  const body: MailBody = { text: null, html: null, attachments: [] };
  walkPart(payload, body);
  return body;
}

function walkPart(part: GmailMessagePart, body: MailBody): void {
  if (isAttachmentPart(part)) {
    body.attachments.push(toAttachmentMeta(part));
    return;
  }

  if (part.mimeType === 'text/plain' && part.body?.data) {
    body.text = (body.text ?? '') + decodeBase64Url(part.body.data);
    return;
  }

  if (part.mimeType === 'text/html' && part.body?.data) {
    body.html = (body.html ?? '') + decodeBase64Url(part.body.data);
    return;
  }

  for (const child of part.parts ?? []) {
    walkPart(child, body);
  }
}

// A part with a filename is Gmail's signal for "attachment" (inline or not),
// regardless of its mimeType; multipart/* container parts never carry one.
function isAttachmentPart(part: GmailMessagePart): boolean {
  return Boolean(part.filename);
}

function toAttachmentMeta(part: GmailMessagePart): MailAttachmentMeta {
  const disposition = getHeaderValue(part.headers, 'Content-Disposition');
  const contentId = normalizeContentId(getHeaderValue(part.headers, 'Content-ID'));
  const inline = disposition ? disposition.toLowerCase().startsWith('inline') : Boolean(contentId);

  return {
    id: part.body?.attachmentId ?? '',
    filename: part.filename ?? '',
    mimeType: part.mimeType,
    size: part.body?.size ?? 0,
    ...(contentId ? { contentId } : {}),
    inline,
  };
}

function normalizeContentId(value: string | null): string | null {
  return value ? value.replace(/^<|>$/g, '') : null;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}
