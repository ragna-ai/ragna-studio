import { getEmailMessageById } from '@repo/database';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { seedConnectedGmailAccount, seedEmailThreadWithMessage } from './support/email-fixtures';
import { resetEmailQueueMock } from './support/email-queue.mock';
import {
  buildFakeMailMessage,
  buildFakeMailThread,
  fetchThreadMock,
  resetMailProviderMock,
  setReadMock,
} from './support/mail-provider.mock';

// Thread listing/detail (docs/email/prd.md, "API": "Threads/messages: list
// from local index... thread detail (stored bodies, live fetch + persist
// for gaps)"). Folder derivation, category/label filters, and pagination
// all live in listEmailThreadsForUser/listEmailThreads (email.service.ts /
// email-thread.repo.ts); this file drives them through the real index
// rather than re-deriving expected SQL, by seeding threads/messages
// directly (test/email/support/email-fixtures.ts's
// seedEmailThreadWithMessage, modeling what the sync poller would write).

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

const threadSummarySchema = z.object({
  id: z.string(),
  subject: z.string().nullable(),
  labelIds: z.array(z.string()),
  isStarred: z.boolean(),
  isUnread: z.boolean(),
});
const listResponseSchema = z.object({
  threads: z.array(threadSummarySchema),
  hasMore: z.boolean(),
});

async function listThreads(cookieHeader: string, query: string) {
  const response = await app.request(`/email/thread?${query}`, {
    headers: { cookie: cookieHeader },
  });
  return { status: response.status, body: listResponseSchema.parse(await response.json()) };
}

describe('GET /email/thread (folders)', () => {
  test('inbox: has INBOX, excludes trash/spam', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const inbox = await seedEmailThreadWithMessage({ accountId, labelIds: ['INBOX'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['TRASH'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['SPAM', 'INBOX'] });

    const { body } = await listThreads(cookieHeader, 'folder=inbox');

    expect(body.threads.map((t) => t.id)).toEqual([inbox.thread.id]);
  });

  test('starred: any message starred', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const starred = await seedEmailThreadWithMessage({
      accountId,
      isStarred: true,
      labelIds: ['INBOX'],
    });
    await seedEmailThreadWithMessage({ accountId, isStarred: false, labelIds: ['INBOX'] });

    const { body } = await listThreads(cookieHeader, 'folder=starred');

    expect(body.threads.map((t) => t.id)).toEqual([starred.thread.id]);
  });

  test('sent: has SENT label', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const sent = await seedEmailThreadWithMessage({ accountId, labelIds: ['SENT'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['INBOX'] });

    const { body } = await listThreads(cookieHeader, 'folder=sent');

    expect(body.threads.map((t) => t.id)).toEqual([sent.thread.id]);
  });

  test('trash: has TRASH label', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const trashed = await seedEmailThreadWithMessage({ accountId, labelIds: ['TRASH'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['INBOX'] });

    const { body } = await listThreads(cookieHeader, 'folder=trashed');

    expect(body.threads.map((t) => t.id)).toEqual([trashed.thread.id]);
  });

  test('archive: exclusion-based, not a label of its own', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const archived = await seedEmailThreadWithMessage({ accountId, labelIds: ['IMPORTANT'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['INBOX'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['TRASH'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['SPAM'] });

    const { body } = await listThreads(cookieHeader, 'folder=archived');

    expect(body.threads.map((t) => t.id)).toEqual([archived.thread.id]);
  });
});

describe('GET /email/thread (filters)', () => {
  test('categoryId filters to threads with a matching message', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const categoryResponse = await app.request('/email/category', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Invoices', color: '#00ff00' }),
    });
    const { category } = z
      .object({ category: z.object({ id: z.string() }) })
      .parse(await categoryResponse.json());
    const matching = await seedEmailThreadWithMessage({ accountId, categoryId: category.id });
    await seedEmailThreadWithMessage({ accountId });

    const { body } = await listThreads(cookieHeader, `categoryId=${category.id}`);

    expect(body.threads.map((t) => t.id)).toEqual([matching.thread.id]);
  });

  // docs/email/bugs.md #1: a category view with no folder must still hide
  // trash/spam, even though the trashed message still carries the matching
  // category (Gmail moves-to-trash without clearing classification).
  test('categoryId excludes a trashed thread even though it still matches the category', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const categoryResponse = await app.request('/email/category', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Invoices', color: '#00ff00' }),
    });
    const { category } = z
      .object({ category: z.object({ id: z.string() }) })
      .parse(await categoryResponse.json());
    const matching = await seedEmailThreadWithMessage({ accountId, categoryId: category.id });
    await seedEmailThreadWithMessage({
      accountId,
      categoryId: category.id,
      labelIds: ['TRASH'],
    });

    const { body } = await listThreads(cookieHeader, `categoryId=${category.id}`);

    expect(body.threads.map((t) => t.id)).toEqual([matching.thread.id]);
  });

  test('labelId filters to threads with a matching message label', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const matching = await seedEmailThreadWithMessage({
      accountId,
      labelIds: ['INBOX', 'IMPORTANT'],
    });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['INBOX'] });

    const { body } = await listThreads(cookieHeader, 'labelId=IMPORTANT');

    expect(body.threads.map((t) => t.id)).toEqual([matching.thread.id]);
  });

  // docs/email/bugs.md #1: same leak, but through the read-only Gmail label
  // filter instead of a category.
  test('labelId excludes a trashed thread even though it still carries the label', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const matching = await seedEmailThreadWithMessage({
      accountId,
      labelIds: ['INBOX', 'IMPORTANT'],
    });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['TRASH', 'IMPORTANT'] });

    const { body } = await listThreads(cookieHeader, 'labelId=IMPORTANT');

    expect(body.threads.map((t) => t.id)).toEqual([matching.thread.id]);
  });

  // docs/email/bugs.md #1: no folder, no category, no label - the plain
  // "list everything" view must not surface trash either.
  test('no filter at all still excludes trash/spam', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const inbox = await seedEmailThreadWithMessage({ accountId, labelIds: ['INBOX'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['TRASH'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['SPAM'] });

    const { body } = await listThreads(cookieHeader, '');

    expect(body.threads.map((t) => t.id)).toEqual([inbox.thread.id]);
  });

  // docs/email/bugs.md #1: "trashed" is the one view that must still show
  // trash - the fix must not exclude it there too.
  test('trashed folder still shows trash even with a category filter applied', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const categoryResponse = await app.request('/email/category', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Invoices', color: '#00ff00' }),
    });
    const { category } = z
      .object({ category: z.object({ id: z.string() }) })
      .parse(await categoryResponse.json());
    const trashed = await seedEmailThreadWithMessage({
      accountId,
      categoryId: category.id,
      labelIds: ['TRASH'],
    });

    const { body } = await listThreads(cookieHeader, `folder=trashed&categoryId=${category.id}`);

    expect(body.threads.map((t) => t.id)).toEqual([trashed.thread.id]);
  });
});

describe('GET /email/thread (pagination)', () => {
  test('hasMore reflects whether another page exists', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const base = Date.now();
    const oldest = await seedEmailThreadWithMessage({ accountId, sentAt: new Date(base) });
    const middle = await seedEmailThreadWithMessage({ accountId, sentAt: new Date(base + 1000) });
    const newest = await seedEmailThreadWithMessage({ accountId, sentAt: new Date(base + 2000) });

    const page1 = await listThreads(cookieHeader, 'limit=2&page=1');
    expect(page1.body.threads.map((t) => t.id)).toEqual([newest.thread.id, middle.thread.id]);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await listThreads(cookieHeader, 'limit=2&page=2');
    expect(page2.body.threads.map((t) => t.id)).toEqual([oldest.thread.id]);
    expect(page2.body.hasMore).toBe(false);
  });
});

describe('GET /email/thread/:threadId', () => {
  test("404s for a thread outside the caller's account", async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/thread/019fb2d8-0000-7000-8000-000000000000', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('serves an already-persisted body straight from the DB, no provider call', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({
      accountId,
      textBody: 'Already stored text.',
      withBody: true,
    });

    const response = await app.request(`/email/thread/${seeded.thread.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = z
      .object({
        messages: z.array(z.object({ body: z.object({ text: z.string().nullable() }) })),
      })
      .parse(await response.json());
    expect(body.messages[0]?.body.text).toBe('Already stored text.');
    expect(fetchThreadMock).not.toHaveBeenCalled();
  });

  test('lazily fetches and persists a missing body, then serves the second request from the DB', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, withBody: false });

    fetchThreadMock.mockImplementationOnce(() =>
      Promise.resolve(
        buildFakeMailThread({
          id: seeded.providerThreadId,
          messages: [
            buildFakeMailMessage({
              id: seeded.providerMessageId,
              threadId: seeded.providerThreadId,
              body: { text: 'Fresh content', html: '<p>Fresh content</p>', attachments: [] },
            }),
          ],
        }),
      ),
    );

    const first = await app.request(`/email/thread/${seeded.thread.id}`, {
      headers: { cookie: cookieHeader },
    });
    expect(first.status).toBe(StatusCodes.OK);
    const firstBody = z
      .object({
        messages: z.array(z.object({ body: z.object({ text: z.string().nullable() }) })),
      })
      .parse(await first.json());
    expect(firstBody.messages[0]?.body.text).toBe('Fresh content');
    expect(fetchThreadMock).toHaveBeenCalledTimes(1);

    const second = await app.request(`/email/thread/${seeded.thread.id}`, {
      headers: { cookie: cookieHeader },
    });
    expect(second.status).toBe(StatusCodes.OK);
    const secondBody = z
      .object({
        messages: z.array(z.object({ body: z.object({ text: z.string().nullable() }) })),
      })
      .parse(await second.json());
    expect(secondBody.messages[0]?.body.text).toBe('Fresh content');
    // Second request found the body already persisted - no second live fetch.
    expect(fetchThreadMock).toHaveBeenCalledTimes(1);
  });
});

// GET must stay a pure, idempotent read (docs/email/prd.md). Marking a
// thread read on open was tried and reverted: it made an incidental refetch
// silently undo an explicit "mark unread" from the client. Marking read is
// the client's job, through the existing POST /email/thread/:threadId/read
// (see actions.test.ts).
describe('GET /email/thread/:threadId (read-only)', () => {
  test('opening a thread does not change isUnread or call the provider', async () => {
    const { cookieHeader, accountId } = await connectAccount();
    const seeded = await seedEmailThreadWithMessage({ accountId, isUnread: true });

    const response = await app.request(`/email/thread/${seeded.thread.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(setReadMock).not.toHaveBeenCalled();

    const row = await getEmailMessageById({ id: seeded.messageId });
    expect(row?.isUnread).toBe(true);

    const body = z
      .object({
        thread: z.object({ isUnread: z.boolean() }),
        messages: z.array(z.object({ isUnread: z.boolean() })),
      })
      .parse(await response.json());
    expect(body.thread.isUnread).toBe(true);
    expect(body.messages[0]?.isUnread).toBe(true);
  });
});
