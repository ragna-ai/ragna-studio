import {
  GMAIL_ENDPOINTS,
  GMAIL_MAILBOX,
  GMAIL_NOT_FOUND_BODY,
  vendorRequestsTo,
  type VendorRequest,
} from '@repo/testing';
import * as z from 'zod';
import { seedConnectedGmailAccount } from '../support/email-fixtures';
import { runMailContract, type SentMessageSummary } from '../support/mail-contract';

const sendBodySchema = z.object({ raw: z.string() });

function readMimeHeader(mime: string, name: string): string | null {
  const match = mime.match(new RegExp(`^${name}: (.*)$`, 'mi'));
  return match?.[1]?.trim() ?? null;
}

function readSentMessage(): SentMessageSummary {
  const [request] = vendorRequestsTo(GMAIL_ENDPOINTS.send);
  const { raw } = sendBodySchema.parse(JSON.parse(request?.body ?? '{}'));
  const mime = Buffer.from(raw, 'base64url').toString('utf-8');
  const to = readMimeHeader(mime, 'To');

  return { subject: readMimeHeader(mime, 'Subject'), recipients: to ? to.split(/,\s*/) : [] };
}

function readSearchQuery(request: VendorRequest): string | null {
  return request.url.searchParams.get('q');
}

runMailContract({
  name: 'Gmail',
  seedMailbox: seedConnectedGmailAccount,
  mailbox: {
    emailAddress: GMAIL_MAILBOX.emailAddress,
    threadId: GMAIL_MAILBOX.threadId,
    firstMessageId: GMAIL_MAILBOX.firstMessageId,
    attachmentPartId: GMAIL_MAILBOX.attachmentPartId,
    draftId: GMAIL_MAILBOX.draftId,
  },
  endpoints: {
    thread: GMAIL_ENDPOINTS.thread,
    search: GMAIL_ENDPOINTS.threadList,
    star: GMAIL_ENDPOINTS.modify,
    deleteDraft: GMAIL_ENDPOINTS.deleteDraft,
  },
  notFoundBody: GMAIL_NOT_FOUND_BODY,
  readSearchQuery,
  readSentMessage,
});
