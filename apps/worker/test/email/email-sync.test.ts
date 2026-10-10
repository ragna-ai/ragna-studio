import {
  getEmailAccountById,
  getEmailMessageById,
  getEmailThreadByProviderThreadId,
  listEmailMessagesByThreadId,
} from '@repo/database';
import { MailProviderError } from '@repo/mail/provider';
import { EMAIL_CLASSIFY_JOB, EMAIL_SYNC_JOB } from '@repo/queue';
import {
  buildFakeMailMessage,
  buildFakeMailThread,
  fetchThreadMock,
  listRecentInboxThreadIdsMock,
  queueAddMock,
  resetProviderMocks,
  seedEmailThreadWithMessage,
  syncFromCursorMock,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processEmailSyncJob } from '../../src/processors/email-sync.processor';
import { seedMailUser } from '../support/email-fixtures';
import { buildJob } from '../support/job';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function syncJob(accountId: string) {
  return buildJob({ name: EMAIL_SYNC_JOB, data: { accountId } });
}

function classifyJobCalls() {
  return queueAddMock.mock.calls.filter(([jobName]) => jobName === EMAIL_CLASSIFY_JOB);
}

describe('processEmailSyncJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('unknown job name throws', async () => {
    const job = buildJob({ name: 'not-a-real-job', data: {} });

    await expect(processEmailSyncJob(job)).rejects.toThrow(
      'Unknown email-sync job: not-a-real-job',
    );
  });

  test('missing account is skipped without touching the provider', async () => {
    const result = await processEmailSyncJob(syncJob(Bun.randomUUIDv7()));

    expect(result).toEqual({ success: true });
    expect(listRecentInboxThreadIdsMock).not.toHaveBeenCalled();
    expect(syncFromCursorMock).not.toHaveBeenCalled();
  });

  describe('initial seed (no cursor)', () => {
    test('imports recent threads with bodies, stores the cursor and never classifies', async () => {
      const { account } = await seedMailUser();
      const message = buildFakeMailMessage({
        id: 'seed-message-1',
        threadId: 'seed-thread-1',
        subject: 'Seeded subject',
        body: { text: 'Seeded body', html: '<p>Seeded body</p>', attachments: [] },
      });
      listRecentInboxThreadIdsMock.mockResolvedValueOnce(['seed-thread-1']);
      fetchThreadMock.mockResolvedValueOnce(
        buildFakeMailThread({ id: 'seed-thread-1', messages: [message] }),
      );

      await processEmailSyncJob(syncJob(account.id));

      const thread = await getEmailThreadByProviderThreadId({
        accountId: account.id,
        providerThreadId: 'seed-thread-1',
      });
      expect(thread?.subject).toBe('Seeded subject');
      const messages = await listEmailMessagesByThreadId({ threadId: thread?.id ?? '' });
      expect(messages).toHaveLength(1);
      expect(messages[0]?.providerMessageId).toBe('seed-message-1');
      expect(queueAddMock).not.toHaveBeenCalled();

      const synced = await getEmailAccountById({ id: account.id });
      expect(synced?.syncCursor).toBe('history-cursor-0');
      expect(synced?.syncState).toBe('idle');
      expect(synced?.lastSyncedAt).toBeInstanceOf(Date);
    });

    test('draft messages inside a thread are not imported as mail', async () => {
      const { account } = await seedMailUser();
      const inbound = buildFakeMailMessage({ id: 'seed-in', threadId: 'seed-thread-2' });
      const draft = buildFakeMailMessage({
        id: 'seed-draft',
        threadId: 'seed-thread-2',
        folder: 'draft',
      });
      listRecentInboxThreadIdsMock.mockResolvedValueOnce(['seed-thread-2']);
      fetchThreadMock.mockResolvedValueOnce(
        buildFakeMailThread({ id: 'seed-thread-2', messages: [inbound, draft] }),
      );

      await processEmailSyncJob(syncJob(account.id));

      const thread = await getEmailThreadByProviderThreadId({
        accountId: account.id,
        providerThreadId: 'seed-thread-2',
      });
      const messages = await listEmailMessagesByThreadId({ threadId: thread?.id ?? '' });
      expect(messages.map((row) => row.providerMessageId)).toEqual(['seed-in']);
    });
  });

  describe('incremental sync (cursor set)', () => {
    test('added inbound message is upserted and a classify job is enqueued', async () => {
      const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
      const message = buildFakeMailMessage({ id: 'new-message', threadId: 'new-thread' });
      syncFromCursorMock.mockResolvedValueOnce({
        status: 'ok',
        changes: [{ type: 'added', message }],
        nextCursor: 'cursor-2',
      });

      await processEmailSyncJob(syncJob(account.id));

      expect(syncFromCursorMock).toHaveBeenCalledWith('cursor-1');
      const thread = await getEmailThreadByProviderThreadId({
        accountId: account.id,
        providerThreadId: 'new-thread',
      });
      const [row] = await listEmailMessagesByThreadId({ threadId: thread?.id ?? '' });
      expect(row?.providerMessageId).toBe('new-message');
      expect(classifyJobCalls()).toHaveLength(1);
      expect(classifyJobCalls()[0]?.[1]).toEqual({ accountId: account.id, messageId: row?.id });
      const synced = await getEmailAccountById({ id: account.id });
      expect(synced?.syncCursor).toBe('cursor-2');
      expect(synced?.syncState).toBe('idle');
    });

    test('a message that is already indexed is not classified again', async () => {
      const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
      const seeded = await seedEmailThreadWithMessage({
        accountId: account.id,
        providerThreadId: 'known-thread',
        providerMessageId: 'known-message',
      });
      const message = buildFakeMailMessage({
        id: seeded.providerMessageId,
        threadId: seeded.providerThreadId,
      });
      syncFromCursorMock.mockResolvedValueOnce({
        status: 'ok',
        changes: [{ type: 'added', message }],
        nextCursor: 'cursor-2',
      });

      await processEmailSyncJob(syncJob(account.id));

      expect(queueAddMock).not.toHaveBeenCalled();
    });

    test.each(['sent', 'spam', 'trash'] as const)(
      '%s mail is stored but not classified',
      async (folder) => {
        const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
        const message = buildFakeMailMessage({
          id: `m-${folder}`,
          threadId: `t-${folder}`,
          folder,
        });
        syncFromCursorMock.mockResolvedValueOnce({
          status: 'ok',
          changes: [{ type: 'added', message }],
          nextCursor: 'cursor-2',
        });

        await processEmailSyncJob(syncJob(account.id));

        const thread = await getEmailThreadByProviderThreadId({
          accountId: account.id,
          providerThreadId: `t-${folder}`,
        });
        const messages = await listEmailMessagesByThreadId({ threadId: thread?.id ?? '' });
        expect(messages).toHaveLength(1);
        expect(queueAddMock).not.toHaveBeenCalled();
      },
    );

    test('draft messages are neither stored nor classified', async () => {
      const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
      const message = buildFakeMailMessage({ id: 'm-draft', threadId: 't-draft', folder: 'draft' });
      syncFromCursorMock.mockResolvedValueOnce({
        status: 'ok',
        changes: [{ type: 'added', message }],
        nextCursor: 'cursor-2',
      });

      await processEmailSyncJob(syncJob(account.id));

      const thread = await getEmailThreadByProviderThreadId({
        accountId: account.id,
        providerThreadId: 't-draft',
      });
      expect(thread).toBeNull();
      expect(queueAddMock).not.toHaveBeenCalled();
    });

    test('messages older than the classify window are stored but not classified', async () => {
      const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
      const message = buildFakeMailMessage({
        id: 'm-old',
        threadId: 't-old',
        date: new Date(Date.now() - 3 * DAY_MS),
      });
      syncFromCursorMock.mockResolvedValueOnce({
        status: 'ok',
        changes: [{ type: 'added', message }],
        nextCursor: 'cursor-2',
      });

      await processEmailSyncJob(syncJob(account.id));

      const thread = await getEmailThreadByProviderThreadId({
        accountId: account.id,
        providerThreadId: 't-old',
      });
      expect(thread).not.toBeNull();
      expect(queueAddMock).not.toHaveBeenCalled();
    });

    test('flagsChanged updates the indexed message and deleted removes it with its empty thread', async () => {
      const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
      const flagged = await seedEmailThreadWithMessage({ accountId: account.id, isUnread: true });
      const removed = await seedEmailThreadWithMessage({ accountId: account.id });
      syncFromCursorMock.mockResolvedValueOnce({
        status: 'ok',
        changes: [
          {
            type: 'flagsChanged',
            messageId: flagged.providerMessageId,
            threadId: flagged.providerThreadId,
            labelIds: ['INBOX', 'STARRED'],
            folder: 'inbox',
            unread: false,
            starred: true,
          },
          {
            type: 'deleted',
            messageId: removed.providerMessageId,
            threadId: removed.providerThreadId,
          },
        ],
        nextCursor: 'cursor-2',
      });

      await processEmailSyncJob(syncJob(account.id));

      const flaggedRow = await getEmailMessageById({ id: flagged.messageId });
      expect(flaggedRow?.isUnread).toBe(false);
      expect(flaggedRow?.isStarred).toBe(true);
      expect(await getEmailMessageById({ id: removed.messageId })).toBeNull();
      const removedThread = await getEmailThreadByProviderThreadId({
        accountId: account.id,
        providerThreadId: removed.providerThreadId,
      });
      expect(removedThread).toBeNull();
    });

    test('an expired cursor falls back to a full reseed with a fresh cursor', async () => {
      const { account } = await seedMailUser({ syncCursor: 'stale-cursor' });
      syncFromCursorMock.mockResolvedValueOnce({ status: 'cursorExpired' });
      listRecentInboxThreadIdsMock.mockResolvedValueOnce(['reseed-thread']);
      fetchThreadMock.mockResolvedValueOnce(
        buildFakeMailThread({
          id: 'reseed-thread',
          messages: [buildFakeMailMessage({ id: 'reseed-message', threadId: 'reseed-thread' })],
        }),
      );

      await processEmailSyncJob(syncJob(account.id));

      const thread = await getEmailThreadByProviderThreadId({
        accountId: account.id,
        providerThreadId: 'reseed-thread',
      });
      expect(thread).not.toBeNull();
      expect(queueAddMock).not.toHaveBeenCalled();
      const synced = await getEmailAccountById({ id: account.id });
      expect(synced?.syncCursor).toBe('history-cursor-0');
    });
  });

  describe('failures', () => {
    test('a provider auth error flags reauth_required and rethrows', async () => {
      const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
      syncFromCursorMock.mockRejectedValueOnce(new MailProviderError('unauthorized', 401));

      await expect(processEmailSyncJob(syncJob(account.id))).rejects.toThrow('unauthorized');

      const synced = await getEmailAccountById({ id: account.id });
      expect(synced?.syncState).toBe('reauth_required');
      expect(synced?.syncCursor).toBe('cursor-1');
    });

    test('any other provider error flags error and rethrows so BullMQ retries', async () => {
      const { account } = await seedMailUser({ syncCursor: 'cursor-1' });
      syncFromCursorMock.mockRejectedValueOnce(new MailProviderError('upstream down', 503));

      await expect(processEmailSyncJob(syncJob(account.id))).rejects.toThrow('upstream down');

      const synced = await getEmailAccountById({ id: account.id });
      expect(synced?.syncState).toBe('error');
    });
  });
});
