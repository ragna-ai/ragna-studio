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

const searchResponseSchema = z.object({
  threads: z.array(z.object({ id: z.string() })),
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

  test('rejects a missing query', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/search', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});
