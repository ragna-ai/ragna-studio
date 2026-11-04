import {
  GRAPH_ENDPOINTS,
  GRAPH_MAILBOX,
  GRAPH_NOT_FOUND_BODY,
  MAILBOX_ALICE,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
  useRealMailProviders,
  vendorRequestsTo,
  type VendorRequest,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../../src/app';
import { resetEmailQueueMock } from '../support/email-queue.mock';
import { seedConnectedMicrosoftAccount } from '../support/email-fixtures';
import { runMailContract, type SentMessageSummary } from '../support/mail-contract';

const messagePatchSchema = z.object({
  subject: z.string().optional(),
  toRecipients: z.array(z.object({ emailAddress: z.object({ address: z.string() }) })).optional(),
});

function readSentMessage(): SentMessageSummary {
  const [sendRequest] = vendorRequestsTo(GRAPH_ENDPOINTS.send);
  const draftId = sendRequest?.url.pathname.split('/').at(-2);
  const patch = vendorRequestsTo(GRAPH_ENDPOINTS.patchMessage)
    .filter((request) => request.url.pathname.endsWith(`/messages/${draftId}`))
    .map((request) => messagePatchSchema.parse(JSON.parse(request.body ?? '{}')))
    .at(-1);

  return {
    subject: patch?.subject ?? null,
    recipients: (patch?.toRecipients ?? []).map((recipient) => recipient.emailAddress.address),
  };
}

function readSearchQuery(request: VendorRequest): string | null {
  const search = request.url.searchParams.get('$search');
  return search?.replace(/^"(.*)"$/, '$1') ?? null;
}

runMailContract({
  name: 'Outlook (Microsoft Graph)',
  seedMailbox: seedConnectedMicrosoftAccount,
  mailbox: {
    emailAddress: GRAPH_MAILBOX.emailAddress,
    threadId: GRAPH_MAILBOX.conversationId,
    firstMessageId: GRAPH_MAILBOX.firstMessageId,
    attachmentPartId: GRAPH_MAILBOX.attachmentId,
    draftId: GRAPH_MAILBOX.draftId,
  },
  endpoints: {
    thread: GRAPH_ENDPOINTS.messages,
    search: GRAPH_ENDPOINTS.messages,
    star: GRAPH_ENDPOINTS.patchMessage,
    deleteDraft: GRAPH_ENDPOINTS.deleteMessage,
  },
  notFoundBody: GRAPH_NOT_FOUND_BODY,
  readSearchQuery,
  readSentMessage,
});

const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

describe('Outlook (Microsoft Graph) only', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
    resetEmailQueueMock();
    useRealMailProviders();
  });

  test('uploads a large attachment in chunks without the bearer token', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedMicrosoftAccount({ userId, cookieHeader });
    const largeFile = new File([new Uint8Array(UPLOAD_CHUNK_BYTES + 1024)], 'scan.pdf', {
      type: 'application/pdf',
    });
    const form = new FormData();
    form.append('to', MAILBOX_ALICE.address);
    form.append('subject', 'Large attachment');
    form.append('html', '<p>See the scan.</p>');
    form.append('files', largeFile);

    const response = await app.request('/email/send', {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: form,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const chunks = vendorRequestsTo(GRAPH_ENDPOINTS.uploadChunk);
    expect(chunks.map((chunk) => chunk.headers.get('Content-Range'))).toEqual([
      `bytes 0-${UPLOAD_CHUNK_BYTES - 1}/${largeFile.size}`,
      `bytes ${UPLOAD_CHUNK_BYTES}-${largeFile.size - 1}/${largeFile.size}`,
    ]);
    expect(chunks.every((chunk) => !chunk.headers.has('Authorization'))).toBe(true);
    expect(vendorRequestsTo(GRAPH_ENDPOINTS.send)).toHaveLength(1);
  });
});
