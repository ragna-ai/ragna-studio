import { getEmailThreadById } from '@repo/database';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  createAgentForWorkspace,
  seedConnectedGmailAccount,
  seedEmailThreadWithMessage,
} from './support/email-fixtures';
import { seedGmailLinkedAccount, seedGoogleAccountWithoutGmailScope } from './support/gmail-account-fixtures';
import { getProfileMock, resetMailProviderMock } from './support/mail-provider.mock';
import { emailSyncAddMock, resetEmailQueueMock } from './support/email-queue.mock';

// Email account connection (docs/email/prd.md, "Auth and account
// connection"). Auth/authorization for /email/* in general are covered by
// test/auth/route-sweep.test.ts (every registered route rejects an
// unauthenticated request); this file only checks the feature's own
// behavior. Every test needs the fake MailProvider (test/email/support/
// mail-provider.mock.ts) and, since email.service.ts enqueues a sync job on
// connect, the extended queue mock (email-queue.mock.ts).

const accountStatusSchema = z.object({
  id: z.string(),
  email: z.string(),
  defaultAgentId: z.string().nullable(),
  syncState: z.enum(['idle', 'syncing', 'error']),
  lastSyncedAt: z.string().nullable(),
});

const statusResponseSchema = z.object({
  connected: z.boolean(),
  account: accountStatusSchema.nullable(),
});

const fullAccountResponseSchema = z.object({
  account: z.object({
    id: z.string(),
    userId: z.string(),
    email: z.string(),
    defaultAgentId: z.string().nullable(),
    syncState: z.enum(['idle', 'syncing', 'error']),
  }),
});

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetMailProviderMock();
  resetEmailQueueMock();
});

describe('GET /email/account', () => {
  test('reports not connected for a fresh user', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/email/account', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.OK);
    const body = statusResponseSchema.parse(await response.json());
    expect(body.connected).toBe(false);
    expect(body.account).toBeNull();
  });

  test('reports the connected account after connecting', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const connected = await seedConnectedGmailAccount({ userId, cookieHeader, email: 'me@gmail.test' });

    const response = await app.request('/email/account', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.OK);
    const body = statusResponseSchema.parse(await response.json());
    expect(body.connected).toBe(true);
    expect(body.account?.id).toBe(connected.accountId);
    expect(body.account?.email).toBe('me@gmail.test');
    expect(body.account?.syncState).toBe('idle');
    expect(body.account?.lastSyncedAt).toBeNull();
  });
});

describe('POST /email/account/connect', () => {
  test('creates the account row, seeds default categories, and enqueues the initial sync', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedGmailLinkedAccount({ userId });
    getProfileMock.mockImplementationOnce(() =>
      Promise.resolve({ emailAddress: 'newly-connected@gmail.test', cursor: 'history-0' }),
    );

    const response = await app.request('/email/account/connect', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = fullAccountResponseSchema.parse(await response.json());
    expect(body.account.email).toBe('newly-connected@gmail.test');
    expect(body.account.userId).toBe(userId);
    expect(body.account.syncState).toBe('idle');

    const categoriesResponse = await app.request('/email/category', { headers: { cookie: cookieHeader } });
    const categoriesBody = z
      .object({ categories: z.array(z.object({ name: z.string(), autoDraft: z.boolean() })) })
      .parse(await categoriesResponse.json());
    expect(categoriesBody.categories).toHaveLength(5);
    expect(categoriesBody.categories.every((category) => category.autoDraft === false)).toBe(true);
    expect(categoriesBody.categories.map((category) => category.name).sort()).toEqual(
      ['FYI', 'Marketing', 'Newsletters', 'Notifications', 'To Respond'].sort(),
    );

    expect(emailSyncAddMock).toHaveBeenCalledTimes(1);
  });

  test('rejects with a clean 4xx when no Google account is linked at all', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/email/account/connect', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects with a clean 4xx when Google is linked but gmail.modify was never granted', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedGoogleAccountWithoutGmailScope({ userId });

    const response = await app.request('/email/account/connect', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects a second connect once already connected', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });

    const response = await app.request('/email/account/connect', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});

describe('POST /email/account/disconnect', () => {
  test('removes the account and cascades to its threads/messages', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
    const { thread } = await seedEmailThreadWithMessage({ accountId });

    const response = await app.request('/email/account/disconnect', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);

    const statusResponse = await app.request('/email/account', { headers: { cookie: cookieHeader } });
    const statusBody = statusResponseSchema.parse(await statusResponse.json());
    expect(statusBody.connected).toBe(false);

    expect(await getEmailThreadById({ id: thread.id, accountId })).toBeNull();
  });

  test('404s when there is nothing to disconnect', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/email/account/disconnect', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('PATCH /email/account/settings', () => {
  test('sets and clears the default draft agent', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });
    const agentId = await createAgentForWorkspace(cookieHeader, workspaceId);

    const setResponse = await app.request('/email/account/settings', {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ defaultAgentId: agentId }),
    });
    expect(setResponse.status).toBe(StatusCodes.OK);
    const setBody = fullAccountResponseSchema.parse(await setResponse.json());
    expect(setBody.account.defaultAgentId).toBe(agentId);

    const clearResponse = await app.request('/email/account/settings', {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ defaultAgentId: null }),
    });
    expect(clearResponse.status).toBe(StatusCodes.OK);
    const clearBody = fullAccountResponseSchema.parse(await clearResponse.json());
    expect(clearBody.account.defaultAgentId).toBeNull();
  });

  test('rejects an agent id owned by another user', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });
    const other = await seedAuthenticatedUser();
    const otherAgentId = await createAgentForWorkspace(other.cookieHeader, other.workspaceId);

    const response = await app.request('/email/account/settings', {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ defaultAgentId: otherAgentId }),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});
