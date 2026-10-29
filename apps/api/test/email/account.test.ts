import {
  getProfileMock,
  GOOGLE_IDENTITY_SCOPES,
  providerHttp,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedEmailThreadWithMessage,
  seedGmailConnection,
  seedOutlookConnection,
  truncateAllTables,
} from '@repo/testing';
import { db, getConnectionById, getEmailThreadById } from '@repo/database';
import { account } from '@repo/database/schema';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  createAgentForWorkspace,
  seedConnectedGmailAccount,
  seedConnectedMicrosoftAccount,
} from './support/email-fixtures';
import { emailSyncAddMock, resetEmailQueueMock } from './support/email-queue.mock';

// Auth/authorization for /email/* in general is covered by test/auth/route-sweep.test.ts, not here.

const accountStatusSchema = z.strictObject({
  id: z.string(),
  provider: z.enum(['gmail', 'microsoft']),
  email: z.string(),
  defaultAgentId: z.string().nullable(),
  syncState: z.enum(['idle', 'syncing', 'error', 'reauth_required']),
  lastSyncedAt: z.string().nullable(),
});

const statusResponseSchema = z.strictObject({
  connected: z.boolean(),
  account: accountStatusSchema.nullable(),
});

const fullAccountResponseSchema = z.strictObject({
  account: z.strictObject({
    id: z.string(),
    syncCursor: z.string().nullable(),
    lastSyncedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
    userId: z.string(),
    connectionId: z.string(),
    provider: z.enum(['gmail', 'microsoft']),
    email: z.string(),
    defaultAgentId: z.string().nullable(),
    syncState: z.enum(['idle', 'syncing', 'error', 'reauth_required']),
  }),
});

function connectRequest(
  cookieHeader: string,
  provider: 'gmail' | 'microsoft',
  connectionId: string,
) {
  return app.request('/email/account/connect', {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ provider, connectionId }),
  });
}

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
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
  test('creates the account row on the connection, seeds default categories, and enqueues the initial sync', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedGmailConnection({ userId });
    getProfileMock.mockImplementationOnce(() =>
      Promise.resolve({ emailAddress: 'newly-connected@gmail.test', cursor: 'history-0' }),
    );

    const response = await connectRequest(cookieHeader, 'gmail', connection.id);

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = fullAccountResponseSchema.parse(await response.json());
    expect(body.account.provider).toBe('gmail');
    expect(body.account.email).toBe('newly-connected@gmail.test');
    expect(body.account.userId).toBe(userId);
    expect(body.account.connectionId).toBe(connection.id);
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

  test('rejects a connect request without a connection id', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/email/account/connect', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'gmail' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects a connection that does not exist', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await connectRequest(cookieHeader, 'gmail', Bun.randomUUIDv7());

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test("rejects another user's connection", async () => {
    const owner = await seedAuthenticatedUser();
    const { connection } = await seedGmailConnection({ userId: owner.userId });
    const other = await seedAuthenticatedUser();

    const response = await connectRequest(other.cookieHeader, 'gmail', connection.id);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects a connection that never granted gmail.modify', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedGmailConnection({
      userId,
      scopes: GOOGLE_IDENTITY_SCOPES,
    });

    const response = await connectRequest(cookieHeader, 'gmail', connection.id);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects a connection of another provider', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedOutlookConnection({ userId });

    const response = await connectRequest(cookieHeader, 'gmail', connection.id);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects a connection that needs to be reconnected', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedGmailConnection({ userId, status: 'needs_reauth' });

    const response = await connectRequest(cookieHeader, 'gmail', connection.id);

    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });

  test('rejects a second connect once already connected', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connectionId } = await seedConnectedGmailAccount({ userId, cookieHeader });

    const response = await connectRequest(cookieHeader, 'gmail', connectionId);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('rejects an unknown provider value with a 422', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/email/account/connect', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'yahoo', connectionId: Bun.randomUUIDv7() }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });
});

describe('POST /email/account/connect - microsoft', () => {
  test('creates the account row with provider: microsoft', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedOutlookConnection({ userId });
    getProfileMock.mockImplementationOnce(() =>
      Promise.resolve({ emailAddress: 'newly-connected@outlook.test', cursor: 'delta-0' }),
    );

    const response = await connectRequest(cookieHeader, 'microsoft', connection.id);

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = fullAccountResponseSchema.parse(await response.json());
    expect(body.account.provider).toBe('microsoft');
    expect(body.account.email).toBe('newly-connected@outlook.test');
    expect(emailSyncAddMock).toHaveBeenCalledTimes(1);
  });

  test('accepts mail scopes stored as short names, not just full resource URIs', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedOutlookConnection({
      userId,
      scopes: ['openid', 'Mail.ReadWrite', 'Mail.Send'],
    });

    const response = await connectRequest(cookieHeader, 'microsoft', connection.id);

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test('rejects a connection that never granted Mail.ReadWrite and Mail.Send', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedOutlookConnection({ userId, scopes: ['openid', 'User.Read'] });

    const response = await connectRequest(cookieHeader, 'microsoft', connection.id);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailSyncAddMock).not.toHaveBeenCalled();
  });
});

describe('mailbox after an upgrade from sign-in tokens', () => {
  test('a user without a connection is asked to connect their mailbox again', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/email/account', { headers: { cookie: cookieHeader } });

    const body = statusResponseSchema.parse(await response.json());
    expect(body.connected).toBe(false);
  });

  test('the sign-in account alone cannot connect a mailbox', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await db.insert(account).values({
      userId,
      accountId: 'google-sub',
      providerId: 'google',
      accessToken: 'sign-in-access-token',
      scope: 'openid,email,profile,https://www.googleapis.com/auth/gmail.modify',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await app.request('/email/account/connect', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'gmail' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
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

  test('revokes the Google grant and removes the connection', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connectionId } = await seedConnectedGmailAccount({ userId, cookieHeader });

    await app.request('/email/account/disconnect', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(providerHttp.revokeRequests).toHaveLength(1);
    expect(await getConnectionById({ id: connectionId })).toBeNull();
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
