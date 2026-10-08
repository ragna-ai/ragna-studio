import type { NewEmailMessage } from '@repo/database';
import {
  getEmailMessageBody,
  upsertEmailMessageBodies,
  upsertEmailMessageByProviderMessageId,
  upsertEmailMessagesByProviderMessageId,
  upsertEmailThreadByProviderThreadId,
} from '@repo/database';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { seedConnectedGmailAccount } from '../email/support/email-fixtures';
import { resetEmailQueueMock } from '../email/support/email-queue.mock';
import { resetMailProviderMock } from '../email/support/mail-provider.mock';

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetMailProviderMock();
  resetEmailQueueMock();
});

async function seedThread() {
  const { userId, cookieHeader } = await seedAuthenticatedUser();
  const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
  const thread = await upsertEmailThreadByProviderThreadId({
    accountId,
    providerThreadId: 'provider-thread-batch',
    subject: 'Batch',
    snippet: 'Batch',
    lastMessageAt: new Date(),
    participants: [],
  });
  return { accountId, threadId: thread.id };
}

function buildMessage(
  context: { accountId: string; threadId: string },
  providerMessageId: string,
  overrides: Partial<NewEmailMessage> = {},
): NewEmailMessage {
  return {
    accountId: context.accountId,
    threadId: context.threadId,
    providerMessageId,
    from: { name: 'Sender', email: 'sender@example.test' },
    to: [],
    cc: [],
    subject: 'Subject',
    snippet: 'Snippet',
    sentAt: new Date(),
    isUnread: true,
    isStarred: false,
    folder: 'inbox',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

describe('upsertEmailMessagesByProviderMessageId', () => {
  test('returns an empty list for empty input', async () => {
    expect(await upsertEmailMessagesByProviderMessageId([])).toEqual([]);
  });

  test('inserts every message and maps rows by providerMessageId', async () => {
    const context = await seedThread();

    const rows = await upsertEmailMessagesByProviderMessageId([
      buildMessage(context, 'm-1', { subject: 'One' }),
      buildMessage(context, 'm-2', { subject: 'Two' }),
      buildMessage(context, 'm-3', { subject: 'Three' }),
    ]);

    const subjectByProviderId = new Map(rows.map((row) => [row.providerMessageId, row.subject]));
    expect(rows).toHaveLength(3);
    expect(subjectByProviderId.get('m-1')).toBe('One');
    expect(subjectByProviderId.get('m-2')).toBe('Two');
    expect(subjectByProviderId.get('m-3')).toBe('Three');
  });

  test('updates an existing message on conflict and keeps its id and category', async () => {
    const context = await seedThread();
    const existing = await upsertEmailMessageByProviderMessageId(buildMessage(context, 'm-1'));

    const [updated] = await upsertEmailMessagesByProviderMessageId([
      buildMessage(context, 'm-1', {
        subject: 'Changed',
        isUnread: false,
        isStarred: true,
        folder: 'archive',
        labelIds: ['STARRED'],
      }),
    ]);

    expect(updated?.id).toBe(existing.id);
    expect(updated?.subject).toBe('Changed');
    expect(updated?.isUnread).toBe(false);
    expect(updated?.isStarred).toBe(true);
    expect(updated?.folder).toBe('archive');
    expect(updated?.labelIds).toEqual(['STARRED']);
  });

  test('keeps the last occurrence when a batch repeats a message', async () => {
    const context = await seedThread();

    const rows = await upsertEmailMessagesByProviderMessageId([
      buildMessage(context, 'm-1', { subject: 'First' }),
      buildMessage(context, 'm-2', { subject: 'Other' }),
      buildMessage(context, 'm-1', { subject: 'Last' }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.providerMessageId === 'm-1')?.subject).toBe('Last');
  });

  test('writes batches larger than one chunk', async () => {
    const context = await seedThread();
    const messages = Array.from({ length: 501 }, (_, index) => buildMessage(context, `m-${index}`));

    const rows = await upsertEmailMessagesByProviderMessageId(messages);

    expect(rows).toHaveLength(501);
    expect(new Set(rows.map((row) => row.providerMessageId)).size).toBe(501);
  });
});

describe('upsertEmailMessageBodies', () => {
  test('returns an empty list for empty input', async () => {
    expect(await upsertEmailMessageBodies([])).toEqual([]);
  });

  test('inserts bodies and updates them on conflict', async () => {
    const context = await seedThread();
    const [first, second] = await upsertEmailMessagesByProviderMessageId([
      buildMessage(context, 'm-1'),
      buildMessage(context, 'm-2'),
    ]);
    if (!first || !second) throw new Error('seed failed');

    await upsertEmailMessageBodies([
      { messageId: first.id, textBody: 'one', htmlBody: '<p>one</p>' },
      { messageId: second.id, textBody: 'two', htmlBody: null },
    ]);
    await upsertEmailMessageBodies([{ messageId: first.id, textBody: 'one v2', htmlBody: null }]);

    expect((await getEmailMessageBody({ messageId: first.id }))?.textBody).toBe('one v2');
    expect((await getEmailMessageBody({ messageId: first.id }))?.htmlBody).toBeNull();
    expect((await getEmailMessageBody({ messageId: second.id }))?.textBody).toBe('two');
  });

  test('keeps the last occurrence when a batch repeats a message', async () => {
    const context = await seedThread();
    const [message] = await upsertEmailMessagesByProviderMessageId([buildMessage(context, 'm-1')]);
    if (!message) throw new Error('seed failed');

    const rows = await upsertEmailMessageBodies([
      { messageId: message.id, textBody: 'first', htmlBody: null },
      { messageId: message.id, textBody: 'last', htmlBody: null },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.textBody).toBe('last');
  });

  test('writes batches larger than one chunk', async () => {
    const context = await seedThread();
    const messages = await upsertEmailMessagesByProviderMessageId(
      Array.from({ length: 501 }, (_, index) => buildMessage(context, `m-${index}`)),
    );

    const rows = await upsertEmailMessageBodies(
      messages.map((message) => ({ messageId: message.id, textBody: 'x', htmlBody: null })),
    );

    expect(rows).toHaveLength(501);
  });
});
