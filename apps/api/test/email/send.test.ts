import { createMedia } from '@repo/database';
import { downloadObjectBufferMock, resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  createAgentForWorkspace,
  seedConnectedGmailAccount,
  seedEmailDraft,
  seedEmailThreadWithMessage,
} from './support/email-fixtures';
import { resetEmailQueueMock } from './support/email-queue.mock';
import { resetMailProviderMock, sendMock } from './support/mail-provider.mock';

// Compose / send (docs/email/prd.md, "API": "Compose/send: send via Gmail
// API..."). POST /email/send and POST /email/draft/:draftId/send were just
// refactored to zod form validation (validation/email.schema.ts);
// re-verified against the controller + schema on disk before writing these
// (both present, task #9 already landed). Target contract per that
// schema's own comment block: a field sent once arrives bare, sent
// repeatedly arrives as an array, absent normalizes to `[]` for the
// repeated string/file fields, subject is required (422, not 400 - an
// intentional change from the old hand-rolled 400), and a non-File `files`
// entry now 422s instead of being silently dropped.

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetMailProviderMock();
  resetEmailQueueMock();
});

async function connectAccount() {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
  return { userId, workspaceId, cookieHeader, accountId };
}

type FormValue = string | File | Array<string | File> | undefined;

function buildFormData(fields: Record<string, FormValue>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      formData.append(key, entry);
    }
  }
  return formData;
}

function sendEmailRequest(cookieHeader: string, fields: Record<string, FormValue>) {
  return app.request('/email/send', {
    method: 'POST',
    headers: { cookie: cookieHeader },
    body: buildFormData(fields),
  });
}

const sendResponseSchema = z.object({ messageId: z.string(), threadId: z.string() });

describe('POST /email/send - field normalization', () => {
  test('a bare (single) value normalizes to a one-element array', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      subject: 'Hello',
      text: 'Body text',
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    sendResponseSchema.parse(await response.json());
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({ to: [{ address: 'recipient@example.test' }] });
  });

  test('a repeated field normalizes to a multi-element array', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await sendEmailRequest(cookieHeader, {
      to: ['a@example.test', 'b@example.test'],
      cc: ['c@example.test', 'd@example.test'],
      subject: 'Hello',
      text: 'Body text',
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const input = sendMock.mock.calls[0]?.[0] as { to: Array<{ address: string }>; cc?: Array<{ address: string }> };
    expect(input.to.map((a) => a.address)).toEqual(['a@example.test', 'b@example.test']);
    expect(input.cc?.map((a) => a.address)).toEqual(['c@example.test', 'd@example.test']);
  });

  test('an absent repeated field normalizes to empty, not undefined/error', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      subject: 'Hello',
      text: 'Body text',
      // cc/bcc/mediaId/files all omitted entirely
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const input = sendMock.mock.calls[0]?.[0] as { cc?: Array<unknown>; bcc?: Array<unknown> };
    expect(input.cc ?? []).toEqual([]);
    expect(input.bcc ?? []).toEqual([]);
  });
});

describe('POST /email/send - subject validation', () => {
  test('missing subject is a 422, not a 400', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      text: 'Body text',
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('empty-string subject is a 422', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      subject: '',
      text: 'Body text',
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /email/send - files', () => {
  test('uploaded files reach the provider intact (filename, mimeType, bytes)', async () => {
    const { cookieHeader } = await connectAccount();
    const file = new File([Buffer.from('hello attachment')], 'note.txt', { type: 'text/plain' });

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      subject: 'Hello',
      text: 'Body text',
      files: file,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const input = sendMock.mock.calls[0]?.[0] as {
      attachments?: Array<{ filename: string; mimeType: string; content: Buffer }>;
    };
    expect(input.attachments).toHaveLength(1);
    expect(input.attachments?.[0]?.filename).toBe('note.txt');
    // The multipart encoder appends a charset for text/* parts (same as a
    // real browser file picker would for a .txt file), so match the base
    // type rather than the exact string.
    expect(input.attachments?.[0]?.mimeType).toMatch(/^text\/plain/);
    expect(input.attachments?.[0]?.content.toString('utf8')).toBe('hello attachment');
  });

  test('a non-File value in the files field 422s (no longer silently dropped)', async () => {
    const { cookieHeader } = await connectAccount();
    const formData = buildFormData({ to: 'recipient@example.test', subject: 'Hello', text: 'Body text' });
    formData.append('files', 'not-a-file');

    const response = await app.request('/email/send', {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /email/send - media library attachments', () => {
  test('attaches media owned by one of the caller\'s workspaces', async () => {
    const { cookieHeader, workspaceId } = await connectAccount();
    const media = await createMedia({
      ownerWorkspaceId: workspaceId,
      bucket: 'test-documents-bucket',
      storageKey: 'test-key.pdf',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      size: 42,
      origin: 'uploaded',
    });

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      subject: 'Hello',
      text: 'Body text',
      mediaId: media.id,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(downloadObjectBufferMock).toHaveBeenCalledTimes(1);
    const input = sendMock.mock.calls[0]?.[0] as { attachments?: Array<{ filename: string }> };
    expect(input.attachments?.[0]?.filename).toBe('invoice.pdf');
  });

  test('rejects media from a workspace the caller does not own', async () => {
    const { cookieHeader } = await connectAccount();
    const other = await seedAuthenticatedUser();
    const media = await createMedia({
      ownerWorkspaceId: other.workspaceId,
      bucket: 'test-documents-bucket',
      storageKey: 'other-key.pdf',
      filename: 'not-yours.pdf',
      mimeType: 'application/pdf',
      size: 42,
      origin: 'uploaded',
    });

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      subject: 'Hello',
      text: 'Body text',
      mediaId: media.id,
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /email/send - body requirement', () => {
  test('rejects when neither html nor text is provided', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      subject: 'Hello',
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /email/send - replies', () => {
  test('threads a reply via the owned thread/message pair', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId });

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      subject: 'Re: Hello',
      text: 'Reply body',
      threadId: seeded.thread.id,
      replyToMessageId: seeded.messageId,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const input = sendMock.mock.calls[0]?.[0] as { thread?: { threadId: string } };
    expect(input.thread?.threadId).toBe(seeded.providerThreadId);
  });
});

describe('POST /email/send - draftId', () => {
  test('marks the referenced draft sent without touching its content (no content field on this route)', async () => {
    const { cookieHeader, workspaceId, accountId } = await connectAccount();
    const agentId = await createAgentForWorkspace(cookieHeader, workspaceId);
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      status: 'ready',
      content: 'Original AI draft body.',
    });

    const response = await sendEmailRequest(cookieHeader, {
      to: 'recipient@example.test',
      subject: 'Hello',
      text: 'Original AI draft body.',
      draftId: draft.id,
    });

    expect(response.status).toBe(StatusCodes.CREATED);

    const draftsResponse = await app.request(`/email/draft?threadId=${seeded.thread.id}`, {
      headers: { cookie: cookieHeader },
    });
    const draftsBody = z
      .object({ drafts: z.array(z.object({ id: z.string(), status: z.string(), content: z.string() })) })
      .parse(await draftsResponse.json());
    const updated = draftsBody.drafts.find((d) => d.id === draft.id);
    expect(updated?.status).toBe('sent');
    expect(updated?.content).toBe('Original AI draft body.');
  });
});

describe('POST /email/draft/:draftId/send', () => {
  test('persists the edited content and flips status to sent', async () => {
    const { cookieHeader, workspaceId, accountId } = await connectAccount();
    const agentId = await createAgentForWorkspace(cookieHeader, workspaceId);
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      status: 'ready',
      content: 'Original AI draft body.',
    });

    const formData = buildFormData({
      to: 'recipient@example.test',
      subject: 'Re: Hello',
      text: 'Original AI draft body.',
      content: 'Edited by the user before sending.',
    });

    const response = await app.request(`/email/draft/${draft.id}/send`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    sendResponseSchema.parse(await response.json());

    const draftsResponse = await app.request(`/email/draft?threadId=${seeded.thread.id}`, {
      headers: { cookie: cookieHeader },
    });
    const draftsBody = z
      .object({ drafts: z.array(z.object({ id: z.string(), status: z.string(), content: z.string() })) })
      .parse(await draftsResponse.json());
    const updated = draftsBody.drafts.find((d) => d.id === draft.id);
    expect(updated?.status).toBe('sent');
    expect(updated?.content).toBe('Edited by the user before sending.');
  });

  test('404s for a draft that does not belong to the caller\'s account', async () => {
    const { cookieHeader } = await connectAccount();
    const other = await seedAuthenticatedUser();
    const otherConnected = await seedConnectedGmailAccount({
      userId: other.userId,
      cookieHeader: other.cookieHeader,
    });
    const otherAgentId = await createAgentForWorkspace(other.cookieHeader, other.workspaceId);
    const otherThread = await seedEmailThreadWithMessage({ accountId: otherConnected.accountId });
    const otherDraft = await seedEmailDraft({
      accountId: otherConnected.accountId,
      threadId: otherThread.thread.id,
      agentId: otherAgentId,
    });

    const formData = buildFormData({ to: 'recipient@example.test', subject: 'Hi', text: 'Body' });
    const response = await app.request(`/email/draft/${otherDraft.id}/send`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
