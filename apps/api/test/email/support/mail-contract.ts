// apps/api/test/email/support/mail-contract.ts
//
// Shared scenarios every mail vendor must pass, run through the API against the real
// adapter and the vendor HTTP fake. Each vendor's contract test file calls
// runMailContract once, then adds its vendor-only cases.
import { getEmailDraftById, getEmailMessageById } from '@repo/database';
import {
  failVendorEndpoint,
  MAILBOX_ALICE,
  MAILBOX_ATTACHMENT,
  MAILBOX_FIRST_MESSAGE,
  MAILBOX_SEARCH_QUERY,
  MAILBOX_SUBJECT,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedEmailDraft,
  seedEmailThreadWithMessage,
  truncateAllTables,
  useRealMailProviders,
  vendorHttp,
  vendorRequestsTo,
  type VendorEndpoint,
  type VendorRequest,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../../src/app';
import type { ConnectedGmailAccount } from './email-fixtures';
import { resetEmailQueueMock } from './email-queue.mock';

export interface ContractMailbox {
  emailAddress: string;
  threadId: string;
  firstMessageId: string;
  attachmentPartId: string;
  draftId: string;
}

export interface ContractEndpoints {
  /** The call that loads a thread's messages. */
  thread: VendorEndpoint;
  search: VendorEndpoint;
  star: VendorEndpoint;
  deleteDraft: VendorEndpoint;
}

export interface SentMessageSummary {
  subject: string | null;
  recipients: string[];
}

export interface SeedMailboxParams {
  userId: string;
  cookieHeader: string;
}

export interface MailContractVendor {
  name: string;
  seedMailbox: (params: SeedMailboxParams) => Promise<ConnectedGmailAccount>;
  mailbox: ContractMailbox;
  endpoints: ContractEndpoints;
  notFoundBody: unknown;
  /** The search text as the vendor received it, unwrapped from the vendor's query syntax. */
  readSearchQuery: (request: VendorRequest) => string | null;
  /** What the vendor was asked to send, read from the recorded vendor requests. */
  readSentMessage: () => SentMessageSummary;
}

const participantSchema = z.strictObject({ name: z.string().nullable(), email: z.string() });

const threadSummarySchema = z.strictObject({
  id: z.string(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  participants: z.array(participantSchema),
  labelIds: z.array(z.string()),
  categoryId: z.string().nullable(),
  isUnread: z.boolean(),
  isStarred: z.boolean(),
  messageCount: z.number(),
});

const messageDetailSchema = z.strictObject({
  id: z.string(),
  from: participantSchema,
  to: z.array(participantSchema),
  cc: z.array(participantSchema),
  subject: z.string().nullable(),
  sentAt: z.string(),
  isUnread: z.boolean(),
  isStarred: z.boolean(),
  labelIds: z.array(z.string()),
  categoryId: z.string().nullable(),
  needsReply: z.boolean(),
  body: z.strictObject({ text: z.string().nullable(), html: z.string().nullable() }),
});

const threadDetailSchema = z.strictObject({
  thread: threadSummarySchema,
  messages: z.array(messageDetailSchema),
});

const searchResponseSchema = z.strictObject({
  threads: z.array(threadSummarySchema),
  nextPageToken: z.string().nullable(),
});

const accountStatusSchema = z.strictObject({
  connected: z.boolean(),
  account: z
    .strictObject({
      id: z.string(),
      integrationId: z.enum(['gmail', 'outlook-mail']),
      email: z.string(),
      defaultAgentId: z.string().nullable(),
      syncState: z.enum(['idle', 'syncing', 'error', 'reauth_required']),
      lastSyncedAt: z.string().nullable(),
    })
    .nullable(),
});

const attachmentListSchema = z.strictObject({
  attachments: z.array(
    z.strictObject({
      partId: z.string(),
      attachmentId: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      size: z.number(),
      contentId: z.string().optional(),
      inline: z.boolean(),
    }),
  ),
});

function buildFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return formData;
}

export function runMailContract(vendor: MailContractVendor): void {
  describe(`mail contract: ${vendor.name}`, () => {
    beforeEach(async () => {
      await truncateAllTables();
      resetProviderMocks();
      resetEmailQueueMock();
      useRealMailProviders();
    });

    async function connectMailbox() {
      const { userId, cookieHeader } = await seedAuthenticatedUser();
      const { accountId } = await vendor.seedMailbox({ userId, cookieHeader });
      return { userId, cookieHeader, accountId };
    }

    test('connects the mailbox under the address the vendor reports', async () => {
      const { cookieHeader } = await connectMailbox();

      const response = await app.request('/email/account', { headers: { cookie: cookieHeader } });

      expect(response.status).toBe(StatusCodes.OK);
      const body = accountStatusSchema.parse(await response.json());
      expect(body.account?.email).toBe(vendor.mailbox.emailAddress);
    });

    test('loads a missing message body from the vendor thread', async () => {
      const { cookieHeader, accountId } = await connectMailbox();
      const seeded = await seedEmailThreadWithMessage({
        accountId,
        providerThreadId: vendor.mailbox.threadId,
        providerMessageId: vendor.mailbox.firstMessageId,
        withBody: false,
      });

      const response = await app.request(`/email/thread/${seeded.thread.id}`, {
        headers: { cookie: cookieHeader },
      });

      expect(response.status).toBe(StatusCodes.OK);
      const body = threadDetailSchema.parse(await response.json());
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0]?.body.text).toContain(MAILBOX_FIRST_MESSAGE.text);
      expect(body.messages[0]?.body.html).toContain(MAILBOX_FIRST_MESSAGE.text);
    });

    test('search passes the query to the vendor and imports the unknown thread', async () => {
      const { cookieHeader } = await connectMailbox();

      const response = await app.request(
        `/email/search?q=${encodeURIComponent(MAILBOX_SEARCH_QUERY)}`,
        { headers: { cookie: cookieHeader } },
      );

      expect(response.status).toBe(StatusCodes.OK);
      const body = searchResponseSchema.parse(await response.json());
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0]?.subject).toContain(MAILBOX_SUBJECT);
      expect(body.threads[0]?.messageCount).toBe(2);
      expect(body.threads[0]?.participants.map((person) => person.email)).toContain(
        MAILBOX_ALICE.address,
      );
      const [searchRequest] = vendorRequestsTo(vendor.endpoints.search);
      expect(searchRequest ? vendor.readSearchQuery(searchRequest) : null).toBe(
        MAILBOX_SEARCH_QUERY,
      );
    });

    test('lists the attachments of a message and downloads their bytes', async () => {
      const { cookieHeader, accountId } = await connectMailbox();
      const { messageId } = await seedEmailThreadWithMessage({
        accountId,
        providerThreadId: vendor.mailbox.threadId,
        providerMessageId: vendor.mailbox.firstMessageId,
      });

      const listResponse = await app.request(`/email/message/${messageId}/attachments`, {
        headers: { cookie: cookieHeader },
      });
      expect(listResponse.status).toBe(StatusCodes.OK);
      const { attachments } = attachmentListSchema.parse(await listResponse.json());
      expect(attachments).toHaveLength(1);
      expect(attachments[0]?.partId).toBe(vendor.mailbox.attachmentPartId);
      expect(attachments[0]?.filename).toBe(MAILBOX_ATTACHMENT.filename);
      expect(attachments[0]?.mimeType).toBe(MAILBOX_ATTACHMENT.mimeType);
      expect(attachments[0]?.inline).toBe(false);

      const download = await app.request(
        `/email/message/${messageId}/attachment/${encodeURIComponent(vendor.mailbox.attachmentPartId)}`,
        { headers: { cookie: cookieHeader } },
      );
      expect(download.status).toBe(StatusCodes.OK);
      expect(download.headers.get('content-type')).toBe(MAILBOX_ATTACHMENT.mimeType);
      const downloadedBytes = Buffer.from(await download.arrayBuffer());
      expect(downloadedBytes.equals(MAILBOX_ATTACHMENT.bytes)).toBe(true);
    });

    test('stars a message at the vendor and stores the flag', async () => {
      const { cookieHeader, accountId } = await connectMailbox();
      const { messageId } = await seedEmailThreadWithMessage({
        accountId,
        providerThreadId: vendor.mailbox.threadId,
        providerMessageId: vendor.mailbox.firstMessageId,
        isStarred: false,
      });

      const response = await app.request(`/email/message/${messageId}/star`, {
        method: 'POST',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ starred: true }),
      });

      expect(response.status).toBe(StatusCodes.OK);
      expect(vendorRequestsTo(vendor.endpoints.star)).toHaveLength(1);
      const stored = await getEmailMessageById({ id: messageId });
      expect(stored?.isStarred).toBe(true);
    });

    test('sends a message with the requested subject and recipient', async () => {
      const { cookieHeader } = await connectMailbox();

      const response = await app.request('/email/send', {
        method: 'POST',
        headers: { cookie: cookieHeader },
        body: buildFormData({
          to: MAILBOX_ALICE.address,
          subject: 'Contract send',
          html: '<p>Sent through the contract suite.</p>',
        }),
      });

      expect(response.status).toBe(StatusCodes.CREATED);
      const sent = vendor.readSentMessage();
      expect(sent.subject).toBe('Contract send');
      expect(sent.recipients).toEqual([MAILBOX_ALICE.address]);
    });

    async function openThreadWithMissingBody() {
      const { cookieHeader, accountId } = await connectMailbox();
      const seeded = await seedEmailThreadWithMessage({
        accountId,
        providerThreadId: vendor.mailbox.threadId,
        providerMessageId: vendor.mailbox.firstMessageId,
        withBody: false,
      });
      return () =>
        app.request(`/email/thread/${seeded.thread.id}`, { headers: { cookie: cookieHeader } });
    }

    test('retries a rate-limited call after the delay the vendor asks for', async () => {
      const openThread = await openThreadWithMissingBody();
      failVendorEndpoint(vendor.endpoints.thread, {
        status: 429,
        headers: { 'Retry-After': '2' },
        times: 1,
      });

      const response = await openThread();

      expect(response.status).toBe(StatusCodes.OK);
      expect(vendorHttp.sleeps).toEqual([2000]);
    });

    test('backs off on a vendor server error, then reports the failure', async () => {
      const openThread = await openThreadWithMissingBody();
      failVendorEndpoint(vendor.endpoints.thread, { status: 503 });

      const response = await openThread();

      expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(vendorRequestsTo(vendor.endpoints.thread)).toHaveLength(4);
      expect(vendorHttp.sleeps).toEqual([500, 1000, 2000]);
    });

    test('fails at once when the vendor asks to wait longer than the retry cap', async () => {
      const openThread = await openThreadWithMissingBody();
      failVendorEndpoint(vendor.endpoints.thread, {
        status: 429,
        headers: { 'Retry-After': '120' },
      });

      const response = await openThread();

      expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(vendorRequestsTo(vendor.endpoints.thread)).toHaveLength(1);
      expect(vendorHttp.sleeps).toEqual([]);
    });

    test('retries a rejected token before reporting the failure', async () => {
      const openThread = await openThreadWithMissingBody();
      failVendorEndpoint(vendor.endpoints.thread, { status: 401 });

      const response = await openThread();

      expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(vendorRequestsTo(vendor.endpoints.thread)).toHaveLength(4);
    });

    test('treats a draft the vendor already deleted as discarded', async () => {
      const { cookieHeader, accountId } = await connectMailbox();
      const draft = await seedEmailDraft({
        accountId,
        status: 'ready',
        providerDraftId: vendor.mailbox.draftId,
      });
      failVendorEndpoint(vendor.endpoints.deleteDraft, {
        status: 404,
        body: vendor.notFoundBody,
      });

      const response = await app.request(`/email/draft/${draft.id}/discard`, {
        method: 'POST',
        headers: { cookie: cookieHeader },
      });

      expect(response.status).toBe(StatusCodes.OK);
      expect(vendorRequestsTo(vendor.endpoints.deleteDraft)).toHaveLength(1);
      const stored = await getEmailDraftById({ id: draft.id, accountId });
      expect(stored?.status).toBe('discarded');
    });
  });
}
