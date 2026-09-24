import { htmlToText } from '../../content/html-to-text';
import type {
  InternetMessageHeader,
  ItemBody,
  Message,
  Recipient,
} from '@microsoft/microsoft-graph-types';
import type {
  MailAddress,
  MailAttachmentMeta,
  MailBody,
  MailDraft,
  MailDraftSummary,
  MailFolder,
  MailMessage,
  MailMessageMetadata,
  SendMailInput,
} from '../mail-provider';
import { GraphApiError } from './graph.client';
import type { GraphAttachmentMetadata, GraphWellKnownFolderIds, GraphWellKnownFolderName } from './graph.types';

const FOLDER_NAME_TO_MAIL_FOLDER: Record<GraphWellKnownFolderName, MailFolder> = {
  inbox: 'inbox',
  sentitems: 'sent',
  deleteditems: 'trash',
  junkemail: 'spam',
  drafts: 'draft',
  archive: 'archive',
};

/** Custom (non-well-known) folders, and folders whose id we couldn't resolve, map to 'archive'. */
export function resolveMailFolder(
  parentFolderId: string | null | undefined,
  wellKnownFolderIds: GraphWellKnownFolderIds,
): MailFolder {
  if (!parentFolderId) return 'archive';

  for (const [name, id] of Object.entries(wellKnownFolderIds) as [GraphWellKnownFolderName, string][]) {
    if (id === parentFolderId) return FOLDER_NAME_TO_MAIL_FOLDER[name];
  }

  return 'archive';
}

export function requireField<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new GraphApiError(`Graph response is missing "${field}"`, 502);
  }
  return value;
}

function toMailAddress(recipient?: Recipient | null): MailAddress | null {
  const address = recipient?.emailAddress?.address;
  if (!address) return null;
  const name = recipient.emailAddress?.name;
  return name ? { name, address } : { address };
}

function toMailAddressList(recipients?: Recipient[] | null): MailAddress[] {
  return (recipients ?? [])
    .map(toMailAddress)
    .filter((address): address is MailAddress => address !== null);
}

export function toMailMessageMetadata(raw: Message, wellKnownFolderIds: GraphWellKnownFolderIds): MailMessageMetadata {
  const dateSource = raw.receivedDateTime ?? raw.sentDateTime ?? raw.createdDateTime;

  return {
    id: requireField(raw.id, 'id'),
    threadId: requireField(raw.conversationId, 'conversationId'),
    from: toMailAddress(raw.from),
    to: toMailAddressList(raw.toRecipients),
    cc: toMailAddressList(raw.ccRecipients),
    bcc: toMailAddressList(raw.bccRecipients),
    subject: raw.subject ?? null,
    snippet: raw.bodyPreview ?? '',
    date: new Date(requireField(dateSource, 'receivedDateTime')),
    labelIds: raw.categories ?? [],
    folder: resolveMailFolder(raw.parentFolderId, wellKnownFolderIds),
    unread: raw.isRead === false,
    starred: raw.flag?.flagStatus === 'flagged',
  };
}

function getHeaderValue(headers: InternetMessageHeader[], name: string): string | null {
  const header = headers.find((candidate) => candidate.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function parseReferencesHeader(value: string | null): string[] {
  return value ? value.split(/\s+/).filter(Boolean) : [];
}

function toMailBody(raw: Message, attachments: GraphAttachmentMetadata[]): MailBody {
  const contentType = raw.body?.contentType;
  const content = raw.body?.content ?? null;
  const html = contentType === 'html' ? content : null;
  const text = contentType === 'text' ? content : html ? htmlToText(html) : null;

  return { text, html, attachments: attachments.map(toAttachmentMeta) };
}

function toAttachmentMeta(attachment: GraphAttachmentMetadata): MailAttachmentMeta {
  const id = requireField(attachment.id, 'attachment.id');
  const contentId = attachment.contentId ?? undefined;

  return {
    partId: id,
    attachmentId: id,
    filename: attachment.name ?? '',
    mimeType: attachment.contentType ?? 'application/octet-stream',
    size: attachment.size ?? 0,
    ...(contentId ? { contentId } : {}),
    inline: attachment.isInline ?? false,
  };
}

export function toMailMessage(
  raw: Message,
  attachments: GraphAttachmentMetadata[],
  wellKnownFolderIds: GraphWellKnownFolderIds,
): MailMessage {
  const headers = raw.internetMessageHeaders ?? [];

  return {
    ...toMailMessageMetadata(raw, wellKnownFolderIds),
    body: toMailBody(raw, attachments),
    messageIdHeader: raw.internetMessageId ?? null,
    inReplyTo: getHeaderValue(headers, 'In-Reply-To'),
    references: parseReferencesHeader(getHeaderValue(headers, 'References')),
  };
}

export function toMailDraftSummary(raw: Message): MailDraftSummary {
  return {
    id: requireField(raw.id, 'id'),
    threadId: requireField(raw.conversationId, 'conversationId'),
    to: toMailAddressList(raw.toRecipients),
    cc: toMailAddressList(raw.ccRecipients),
    bcc: toMailAddressList(raw.bccRecipients),
    subject: raw.subject ?? null,
    snippet: raw.bodyPreview ?? '',
    date: new Date(requireField(raw.lastModifiedDateTime ?? raw.createdDateTime, 'lastModifiedDateTime')),
  };
}

export function toMailDraft(raw: Message, attachments: GraphAttachmentMetadata[]): MailDraft {
  return { ...toMailDraftSummary(raw), body: toMailBody(raw, attachments) };
}

function toGraphRecipients(addresses: MailAddress[]): Recipient[] {
  return addresses.map((address) => ({
    emailAddress: address.name ? { address: address.address, name: address.name } : { address: address.address },
  }));
}

function toGraphBody(input: Pick<SendMailInput, 'html' | 'text'>): ItemBody {
  return input.html ? { contentType: 'html', content: input.html } : { contentType: 'text', content: input.text ?? '' };
}

/** PATCH body that writes `input`'s addressing/subject/body onto a message; attachments are reconciled separately. */
export function toGraphMessagePatch(input: SendMailInput): Pick<Message, 'toRecipients' | 'ccRecipients' | 'bccRecipients' | 'subject' | 'body'> {
  return {
    toRecipients: toGraphRecipients(input.to),
    ccRecipients: toGraphRecipients(input.cc ?? []),
    bccRecipients: toGraphRecipients(input.bcc ?? []),
    subject: input.subject,
    body: toGraphBody(input),
  };
}

export function escapeODataStringLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildGraphSearchQuery(query: string): string {
  const escaped = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}
