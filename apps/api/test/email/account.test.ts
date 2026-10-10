import { getEmailThreadById } from '@repo/database';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  createAgentForWorkspace,
  seedConnectedGmailAccount,
  seedConnectedMicrosoftAccount,
  seedEmailThreadWithMessage,
} from './support/email-fixtures';
import {
  seedGmailLinkedAccount,
  seedGoogleAccountWithoutGmailScope,
} from './support/gmail-account-fixtures';
import { getProfileMock, resetMailProviderMock } from './support/mail-provider.mock';
import {
  seedMicrosoftAccountWithoutMailScope,
  seedMicrosoftLinkedAccount,
  seedMicrosoftLinkedAccountWithShortScopes,
} from './support/microsoft-account-fixtures';
import { emailSyncAddMock, resetEmailQueueMock } from './support/email-queue.mock';

// Auth/authorization for /email/* in general is covered by test/auth/route-sweep.test.ts, not here.

const accountStatusSchema = z.object({
  id: z.string(),
  provider: z.enum(['gmail', 'microsoft']),
  email: z.string(),
  defaultAgentId: z.string().nullable(),
  syncState: z.enum(['idle', 'syncing', 'error', 'reauth_required']),
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
    provider: z.enum(['gmail', 'microsoft']),
    email: z.string(),
    defaultAgentId: z.string().nullable(),
    syncState: z.enum(['idle', 'syncing', 'error', 'reauth_required']),
  }),
});

function connectRequest(cookieHeader: string, provider: 'gmail' | 'microsoft') {
  return app.request('/email/account/connect', {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
}

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
    const connected = await seedConnectedGmailAccount({
      userId,
      cookieHeader,
      email: 'me@gmail.test',
    });

    const response = await app.request('/email/account', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.OK);
    const body = statusResponseSchema.parse(await response.json());
    expect(body.connected).toBe(true);
    expect(body.account?.id).toBe(connected.accountId);
    expect(body.account?.provider).toBe('gmail');
    expect(body.account?.email).toBe('me@gmail.test');
    expect(body.account?.syncState).toBe('idle');
    expect(body.account?.lastSyncedAt).toBeNull();
  });

  test('reports provider: microsoft for a connected Outlook mailbox', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedMicrosoftAccount({ userId, cookieHeader, email: 'me@outlook.test' });

    const response = await app.request('/email/account', { headers: { cookie: cookieHeader } });

    const body = statusResponseSchema.parse(await response.json());
    expect(body.account?.provider).toBe('microsoft');
    expect(body.account?.email).toBe('me@outlook.test');
  });
});

describe('POST /email/account/connect - gmail', () => {
  test('creates the account row, seeds default categories, and enqueues the initial sync', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedGmailLinkedAccount({ userId });
    getProfileMock.mockImplementationOnce(() =>
      Promise.resolve({ emailAddress: 'newly-connected@gmail.test', cursor: 'history-0' }),
    );

    const response = await connectRequest(cookieHeader, 'gmail');

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = fullAccountResponseSchema.parse(await response.json());
    expect(body.account.provider).toBe('gmail');
    expect(body.account.email).toBe('newly-connected@gmail.test');
    expect(body.account.userId).toBe(userId);
    expect(body.account.syncState).toBe('idle');

    const categoriesResponse = await app.request('/email/category', {
      headers: { cookie: cookieHeader },
    });
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

    const response = await connectRequest(cookieHeader, 'gmail');

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects with a clean 4xx when Google is linked but gmail.modify was never granted', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedGoogleAccountWithoutGmailScope({ userId });

    const response = await connectRequest(cookieHeader, 'gmail');

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects a second connect once already connected', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });

    const response = await connectRequest(cookieHeader, 'gmail');

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('rejects an unknown provider value with a 422', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/email/account/connect', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'yahoo' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });
});

describe('POST /email/account/connect - microsoft', () => {
  test('creates the account row with provider: microsoft', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedMicrosoftLinkedAccount({ userId });
    getProfileMock.mockImplementationOnce(() =>
      Promise.resolve({ emailAddress: 'newly-connected@outlook.test', cursor: 'delta-0' }),
    );

    const response = await connectRequest(cookieHeader, 'microsoft');

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = fullAccountResponseSchema.parse(await response.json());
    expect(body.account.provider).toBe('microsoft');
    expect(body.account.email).toBe('newly-connected@outlook.test');
    expect(emailSyncAddMock).toHaveBeenCalledTimes(1);
  });

  test('accepts mail scopes stored as short names, not just full resource URIs', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedMicrosoftLinkedAccountWithShortScopes({ userId });

    const response = await connectRequest(cookieHeader, 'microsoft');

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test('rejects with a clean 4xx when no Microsoft account is linked at all', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await connectRequest(cookieHeader, 'microsoft');

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects with a clean 4xx when Microsoft is linked but Mail.ReadWrite/Mail.Send were never granted', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedMicrosoftAccountWithoutMailScope({ userId });

    const response = await connectRequest(cookieHeader, 'microsoft');

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
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

    const statusResponse = await app.request('/email/account', {
      headers: { cookie: cookieHeader },
    });
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
    const { userId, personalWorkspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });
    const agentId = await createAgentForWorkspace(cookieHeader, personalWorkspaceId);

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

  test('rejects an agent of a shared workspace', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });
    const sharedAgentId = await createAgentForWorkspace(cookieHeader, workspaceId);

    const response = await app.request('/email/account/settings', {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ defaultAgentId: sharedAgentId }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
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

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
