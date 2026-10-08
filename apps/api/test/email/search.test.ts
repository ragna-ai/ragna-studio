import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { seedConnectedGmailAccount, seedEmailThreadWithMessage } from './support/email-fixtures';
import { resetEmailQueueMock } from './support/email-queue.mock';
import {
  buildFakeMailThread,
  fetchThreadMock,
  resetMailProviderMock,
  searchMock,
} from './support/mail-provider.mock';

// Search proxies Gmail's q=. Gmail's own
// search does the matching; email.service.ts's searchEmailForUser only
// hydrates the returned provider thread ids against the local index,
// falling back to a live fetch + persist for a thread id we haven't seen
// before.

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

  test('rejects a missing query', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/search', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});
