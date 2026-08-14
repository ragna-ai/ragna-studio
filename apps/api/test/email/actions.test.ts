import { getEmailMessageById } from '@repo/database';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import { seedConnectedGmailAccount, seedEmailThreadWithMessage } from './support/email-fixtures';
import { resetEmailQueueMock } from './support/email-queue.mock';
import {
  resetMailProviderMock,
  setArchivedMock,
  setReadMock,
  setStarredMock,
  trashMessageMock,
} from './support/mail-provider.mock';

// Mailbox actions (docs/email/prd.md, "API": "Actions: archive, trash, star,
// read/unread (Gmail write + local update)"). Every assertion below checks
// both halves of applyMessageAction/applyThreadAction (email.service.ts):
// the fake MailProvider method was called with the right providerMessageId,
// and the local email_messages row reflects the result immediately
// (updateEmailMessageFlags), without waiting for the next sync poll.

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetMailProviderMock();
  resetEmailQueueMock();
});

async function connectAccount() {
  const { userId, cookieHeader } = await seedAuthenticatedUser();
  const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
  return { userId, cookieHeader, accountId };
}

async function seedThreadWithTwoMessages(accountId: string) {
  const providerThreadId = `provider-thread-${crypto.randomUUID()}`;
  const first = await seedEmailThreadWithMessage({ accountId, providerThreadId });
  const second = await seedEmailThreadWithMessage({ accountId, providerThreadId });
  return { threadId: first.thread.id, messageIds: [first.messageId, second.messageId] };
}

describe('POST /email/message/:messageId/archive', () => {
  test('archives: provider call + local flags updated', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, labelIds: ['INBOX'] });

    const response = await app.request(`/email/message/${seeded.messageId}/archive`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setArchivedMock).toHaveBeenCalledWith(seeded.providerMessageId, true);
    const row = await getEmailMessageById({ id: seeded.messageId });
    expect(row?.labelIds).not.toContain('INBOX');
  });

  test('unarchives: provider call + local flags updated', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, labelIds: [] });

    const response = await app.request(`/email/message/${seeded.messageId}/archive`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setArchivedMock).toHaveBeenCalledWith(seeded.providerMessageId, false);
    const row = await getEmailMessageById({ id: seeded.messageId });
    expect(row?.labelIds).toContain('INBOX');
  });

  test('404s for a message on another account', async () => {
    const { cookieHeader } = await connectAccount();
    const other = await seedAuthenticatedUser();
    const { accountId: otherAccountId } = await seedConnectedGmailAccount({
      userId: other.userId,
      cookieHeader: other.cookieHeader,
    });
    const seeded = await seedEmailThreadWithMessage({ accountId: otherAccountId });

    const response = await app.request(`/email/message/${seeded.messageId}/archive`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(setArchivedMock).not.toHaveBeenCalled();
  });
});

describe('POST /email/message/:messageId/trash', () => {
  test('provider call + local flags updated', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId });

    const response = await app.request(`/email/message/${seeded.messageId}/trash`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(trashMessageMock).toHaveBeenCalledWith(seeded.providerMessageId);
    const row = await getEmailMessageById({ id: seeded.messageId });
    expect(row?.labelIds).toContain('TRASH');
  });
});

describe('POST /email/message/:messageId/star', () => {
  test('stars: provider call + local flags updated', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, isStarred: false });

    const response = await app.request(`/email/message/${seeded.messageId}/star`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ starred: true }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setStarredMock).toHaveBeenCalledWith(seeded.providerMessageId, true);
    const row = await getEmailMessageById({ id: seeded.messageId });
    expect(row?.isStarred).toBe(true);
  });

  test('unstars: provider call + local flags updated', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, isStarred: true });

    const response = await app.request(`/email/message/${seeded.messageId}/star`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ starred: false }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setStarredMock).toHaveBeenCalledWith(seeded.providerMessageId, false);
    const row = await getEmailMessageById({ id: seeded.messageId });
    expect(row?.isStarred).toBe(false);
  });
});

describe('POST /email/message/:messageId/read', () => {
  test('marks read: provider call + local flags updated', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, isUnread: true });

    const response = await app.request(`/email/message/${seeded.messageId}/read`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ read: true }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setReadMock).toHaveBeenCalledWith(seeded.providerMessageId, true);
    const row = await getEmailMessageById({ id: seeded.messageId });
    expect(row?.isUnread).toBe(false);
  });

  test('marks unread: provider call + local flags updated', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, isUnread: false });

    const response = await app.request(`/email/message/${seeded.messageId}/read`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ read: false }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setReadMock).toHaveBeenCalledWith(seeded.providerMessageId, false);
    const row = await getEmailMessageById({ id: seeded.messageId });
    expect(row?.isUnread).toBe(true);
  });

  // docs/email/bugs.md #5: the response body is what the web client actually
  // reads to update the UI (useSetMessageRead's onSuccess) - asserting only
  // the DB row, like the two tests above, would miss a bug where the flag
  // persists correctly but the JSON payload sent back doesn't reflect it.
  test('the response body itself carries the flipped flag, not just the DB row', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, isUnread: true });

    const response = await app.request(`/email/message/${seeded.messageId}/read`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ read: true }),
    });

    const body = (await response.json()) as { message: { isUnread: boolean } };
    expect(body.message.isUnread).toBe(false);
  });

  // docs/email/bugs.md #5: exercises both directions back to back on the
  // same message, proving the toggle isn't a one-way "always ends up read"
  // bug - each call's persisted flag must match that call's own `read`
  // value, not just the first one.
  test('toggling read -> unread -> read on the same message flips the flag every time', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, isUnread: true });

    const markRead = async (read: boolean) => {
      const response = await app.request(`/email/message/${seeded.messageId}/read`, {
        method: 'POST',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ read }),
      });
      expect(response.status).toBe(StatusCodes.OK);
      return getEmailMessageById({ id: seeded.messageId });
    };

    expect((await markRead(true))?.isUnread).toBe(false);
    expect((await markRead(false))?.isUnread).toBe(true);
    expect((await markRead(true))?.isUnread).toBe(false);
    expect(setReadMock).toHaveBeenNthCalledWith(1, seeded.providerMessageId, true);
    expect(setReadMock).toHaveBeenNthCalledWith(2, seeded.providerMessageId, false);
    expect(setReadMock).toHaveBeenNthCalledWith(3, seeded.providerMessageId, true);
  });
});

describe('thread-level actions loop every message', () => {
  test('POST /email/thread/:threadId/archive updates every message in the thread', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const { threadId, messageIds } = await seedThreadWithTwoMessages(accountId);

    const response = await app.request(`/email/thread/${threadId}/archive`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setArchivedMock).toHaveBeenCalledTimes(2);
    for (const messageId of messageIds) {
      const row = await getEmailMessageById({ id: messageId });
      expect(row?.labelIds).not.toContain('INBOX');
    }
  });

  test('POST /email/thread/:threadId/star updates every message in the thread', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const { threadId, messageIds } = await seedThreadWithTwoMessages(accountId);

    const response = await app.request(`/email/thread/${threadId}/star`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ starred: true }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setStarredMock).toHaveBeenCalledTimes(2);
    for (const messageId of messageIds) {
      const row = await getEmailMessageById({ id: messageId });
      expect(row?.isStarred).toBe(true);
    }
  });

  test('POST /email/thread/:threadId/read updates every message in the thread', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const { threadId, messageIds } = await seedThreadWithTwoMessages(accountId);

    const response = await app.request(`/email/thread/${threadId}/read`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ read: true }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setReadMock).toHaveBeenCalledTimes(2);
    for (const messageId of messageIds) {
      const row = await getEmailMessageById({ id: messageId });
      expect(row?.isUnread).toBe(false);
    }
  });

  // docs/email/bugs.md #5: a thread where only one of two messages is
  // unread must still flip the flag on the one that's actually unread -
  // applyThreadAction calls setRead on every message regardless of its
  // current state, so this proves the mixed case doesn't get lost.
  test('POST /email/thread/:threadId/read on a mixed-state thread flips the still-unread message', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const providerThreadId = `provider-thread-${crypto.randomUUID()}`;
    const alreadyRead = await seedEmailThreadWithMessage({
      accountId,
      providerThreadId,
      isUnread: false,
    });
    const stillUnread = await seedEmailThreadWithMessage({
      accountId,
      providerThreadId,
      isUnread: true,
    });

    const response = await app.request(`/email/thread/${alreadyRead.thread.id}/read`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ read: true }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect((await getEmailMessageById({ id: alreadyRead.messageId }))?.isUnread).toBe(false);
    expect((await getEmailMessageById({ id: stillUnread.messageId }))?.isUnread).toBe(false);
  });

  test('POST /email/thread/:threadId/trash updates every message in the thread', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const { threadId, messageIds } = await seedThreadWithTwoMessages(accountId);

    const response = await app.request(`/email/thread/${threadId}/trash`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(trashMessageMock).toHaveBeenCalledTimes(2);
    for (const messageId of messageIds) {
      const row = await getEmailMessageById({ id: messageId });
      expect(row?.labelIds).toContain('TRASH');
    }
  });
});
