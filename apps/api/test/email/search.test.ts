import {
  buildFakeMailMessage,
  buildFakeMailThread,
  fetchThreadMock,
  resetProviderMocks,
  searchMock,
  seedAuthenticatedUser,
  seedEmailThreadWithMessage,
  truncateAllTables,
} from '@repo/testing';
import { listEmailMessagesByThreadId } from '@repo/database';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { seedConnectedGmailAccount } from './support/email-fixtures';
import { resetEmailQueueMock } from './support/email-queue.mock';

// Search proxies Gmail's q=. Gmail's own
// search does the matching; email.service.ts's searchEmailForUser only
// hydrates the returned provider thread ids against the local index,
// falling back to a live fetch + persist for a thread id we haven't seen
// before.

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetEmailQueueMock();
});

async function connectAccount() {
  const { userId, cookieHeader } = await seedAuthenticatedUser();
  const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
  return { userId, cookieHeader, accountId };
}

// The thread's subject is its provider id, so tests can tell threads apart.
function buildSubjectedThread(providerThreadId: string) {
  return buildFakeMailThread({
    id: providerThreadId,
    messages: [
      buildFakeMailMessage({
        id: `message-${providerThreadId}`,
        threadId: providerThreadId,
        subject: providerThreadId,
      }),
    ],
  });
}

const threadSummarySchema = z.strictObject({
  id: z.string(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  participants: z.array(z.strictObject({ name: z.string().nullable(), email: z.string() })),
  labelIds: z.array(z.string()),
  categoryId: z.string().nullable(),
  isUnread: z.boolean(),
  isStarred: z.boolean(),
  messageCount: z.number(),
});

const searchResponseSchema = z.strictObject({
  threads: z.array(threadSummarySchema),
  nextPageToken: z.string().nullable(),
});

describe('GET /email/search', () => {
  test('hydrates a known thread id from the local index without a second fetch', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const known = await seedEmailThreadWithMessage({ accountId });

    searchMock.mockImplementationOnce(() =>
      Promise.resolve({ threadIds: [known.providerThreadId], nextPageToken: null }),
    );

    const response = await app.request('/email/search?q=from%3Aboss', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = searchResponseSchema.parse(await response.json());
    expect(body.threads.map((t) => t.id)).toEqual([known.thread.id]);
    expect(searchMock).toHaveBeenCalledWith('from:boss', null);
    expect(fetchThreadMock).not.toHaveBeenCalled();
  });

  test('live-fetches and persists an unknown thread id', async () => {
    const { cookieHeader } = await connectAccount();
    const unknownProviderThreadId = `provider-thread-${crypto.randomUUID()}`;

    searchMock.mockImplementationOnce(() =>
      Promise.resolve({ threadIds: [unknownProviderThreadId], nextPageToken: 'page-2' }),
    );
    fetchThreadMock.mockImplementationOnce(() =>
      Promise.resolve(buildFakeMailThread({ id: unknownProviderThreadId })),
    );

    const response = await app.request('/email/search?q=invoice', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = searchResponseSchema.parse(await response.json());
    expect(body.threads).toHaveLength(1);
    expect(body.nextPageToken).toBe('page-2');
    expect(fetchThreadMock).toHaveBeenCalledWith(unknownProviderThreadId);

    // A second search hitting the same provider thread id now hydrates from
    // the index the first search just persisted, no second live fetch.
    searchMock.mockImplementationOnce(() =>
      Promise.resolve({ threadIds: [unknownProviderThreadId], nextPageToken: null }),
    );
    const secondResponse = await app.request('/email/search?q=invoice', {
      headers: { cookie: cookieHeader },
    });
    const secondBody = searchResponseSchema.parse(await secondResponse.json());
    expect(secondBody.threads.map((t) => t.id)).toEqual(body.threads.map((t) => t.id));
    expect(fetchThreadMock).toHaveBeenCalledTimes(1);
  });

  test('hydrates a mix of indexed and unindexed threads in provider order', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const multiMessage = await seedEmailThreadWithMessage({
      accountId,
      isUnread: false,
      labelIds: ['INBOX'],
    });
    await seedEmailThreadWithMessage({
      accountId,
      providerThreadId: multiMessage.providerThreadId,
      isUnread: true,
      isStarred: true,
      labelIds: ['STARRED'],
    });
    const single = await seedEmailThreadWithMessage({ accountId, isUnread: false });
    const unknownProviderThreadId = `provider-thread-${crypto.randomUUID()}`;

    searchMock.mockImplementationOnce(() =>
      Promise.resolve({
        threadIds: [
          single.providerThreadId,
          unknownProviderThreadId,
          multiMessage.providerThreadId,
        ],
        nextPageToken: null,
      }),
    );
    fetchThreadMock.mockImplementationOnce(() =>
      Promise.resolve(buildFakeMailThread({ id: unknownProviderThreadId })),
    );

    const response = await app.request('/email/search?q=mixed', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = searchResponseSchema.parse(await response.json());
    expect(body.threads).toHaveLength(3);
    const [first, second, third] = body.threads;
    expect(first?.id).toBe(single.thread.id);
    expect(first?.messageCount).toBe(1);
    expect(first?.isUnread).toBe(false);
    expect(second?.id).not.toBe(single.thread.id);
    expect(third?.id).toBe(multiMessage.thread.id);
    expect(third?.messageCount).toBe(2);
    expect(third?.isUnread).toBe(true);
    expect(third?.isStarred).toBe(true);
    expect([...(third?.labelIds ?? [])].sort()).toEqual(['INBOX', 'STARRED']);
    expect(fetchThreadMock).toHaveBeenCalledTimes(1);
  });

  test('persists every message of a live-fetched thread with its body', async () => {
    const { cookieHeader } = await connectAccount();
    const providerThreadId = `provider-thread-${crypto.randomUUID()}`;
    const firstMessageId = `provider-message-${crypto.randomUUID()}`;
    const secondMessageId = `provider-message-${crypto.randomUUID()}`;

    searchMock.mockImplementationOnce(() =>
      Promise.resolve({ threadIds: [providerThreadId], nextPageToken: null }),
    );
    fetchThreadMock.mockImplementationOnce(() =>
      Promise.resolve(
        buildFakeMailThread({
          id: providerThreadId,
          messages: [
            buildFakeMailMessage({
              id: firstMessageId,
              threadId: providerThreadId,
              subject: 'First',
              date: new Date('2026-01-01T10:00:00Z'),
              body: { text: 'First text', html: '<p>First</p>', attachments: [] },
            }),
            buildFakeMailMessage({
              id: secondMessageId,
              threadId: providerThreadId,
              subject: 'Second',
              date: new Date('2026-01-02T10:00:00Z'),
              body: { text: 'Second text', html: null, attachments: [] },
            }),
          ],
        }),
      ),
    );

    const response = await app.request('/email/search?q=invoice', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = searchResponseSchema.parse(await response.json());
    const stored = await listEmailMessagesByThreadId({ threadId: body.threads[0]?.id ?? '' });
    expect(stored.map((message) => message.providerMessageId)).toEqual([
      firstMessageId,
      secondMessageId,
    ]);
    expect(stored.map((message) => message.subject)).toEqual(['First', 'Second']);
    expect(stored.map((message) => message.body?.textBody)).toEqual(['First text', 'Second text']);
    expect(stored.map((message) => message.body?.htmlBody)).toEqual(['<p>First</p>', null]);
  });

  test('never runs more than 4 live fetches at once and keeps provider order', async () => {
    const { cookieHeader } = await connectAccount();
    const providerThreadIds = Array.from(
      { length: 9 },
      () => `provider-thread-${crypto.randomUUID()}`,
    );
    searchMock.mockImplementationOnce(() =>
      Promise.resolve({ threadIds: providerThreadIds, nextPageToken: null }),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    const release: (() => void)[] = [];
    fetchThreadMock.mockImplementation((providerThreadId: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        release.push(() => {
          inFlight -= 1;
          resolve(buildSubjectedThread(providerThreadId));
        });
      });
    });

    const responsePromise = app.request('/email/search?q=many', {
      headers: { cookie: cookieHeader },
    });
    let released = 0;
    while (released < providerThreadIds.length) {
      await Bun.sleep(0);
      const pending = release.splice(0);
      for (const resolveFetch of pending.reverse()) resolveFetch();
      released += pending.length;
    }
    const response = await responsePromise;

    expect(response.status).toBe(StatusCodes.OK);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(fetchThreadMock).toHaveBeenCalledTimes(providerThreadIds.length);
    const body = searchResponseSchema.parse(await response.json());
    expect(body.threads).toHaveLength(providerThreadIds.length);
    expect(body.threads.map((t) => t.subject)).toEqual(providerThreadIds);
  });

  test('leaves out a thread whose live fetch fails and returns the rest', async () => {
    const { cookieHeader } = await connectAccount();
    const [firstId, brokenId, lastId] = [0, 1, 2].map(
      () => `provider-thread-${crypto.randomUUID()}`,
    );
    searchMock.mockImplementationOnce(() =>
      Promise.resolve({ threadIds: [firstId, brokenId, lastId], nextPageToken: null }),
    );
    fetchThreadMock.mockImplementation((providerThreadId: string) =>
      providerThreadId === brokenId
        ? Promise.reject(new Error('provider down'))
        : Promise.resolve(buildSubjectedThread(providerThreadId)),
    );

    const response = await app.request('/email/search?q=partial', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = searchResponseSchema.parse(await response.json());
    expect(body.threads.map((t) => t.subject)).toEqual([firstId, lastId]);
  });

  test('rejects a missing query', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/search', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});
