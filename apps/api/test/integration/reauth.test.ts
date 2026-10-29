import { db } from '@repo/database';
import { NOTIFY_USER_JOB, parseNotifyUserJob } from '@repo/queue';
import {
  createMailProviderMock,
  enqueuedJobs,
  providerHttp,
  rejectProviderRefresh,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedGmailConnection,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { createEmailAccount } from '@repo/database';
import { resetEmailQueueMock } from '../email/support/email-queue.mock';
import { listConnections } from './support/connect-flow';

const HOUR_MS = 60 * 60 * 1000;

async function seedMailboxOnExpiredConnection(userId: string) {
  const seeded = await seedGmailConnection({
    userId,
    accessTokenExpiresAt: new Date(Date.now() - HOUR_MS),
  });
  await createEmailAccount({
    userId,
    connectionId: seeded.connection.id,
    provider: 'gmail',
    email: 'anna@example.com',
  });
  return seeded;
}

function searchMail(cookieHeader: string) {
  return app.request('/email/search?q=invoice', { headers: { cookie: cookieHeader } });
}

function needsReauthNotifications() {
  return enqueuedJobs(NOTIFY_USER_JOB).map(([, data]) => parseNotifyUserJob(data));
}

describe('using a connection token', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
    resetEmailQueueMock();
  });

  test('refreshes an expired access token and stores the new one encrypted', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedMailboxOnExpiredConnection(userId);

    const response = await searchMail(cookieHeader);

    expect(response.status).toBe(StatusCodes.OK);
    const refreshes = providerHttp.tokenRequests.filter(
      (request) => request.form.get('grant_type') === 'refresh_token',
    );
    expect(refreshes).toHaveLength(1);
    const options = createMailProviderMock.mock.calls.at(-1)?.[0];
    expect(await options?.getAccessToken()).toBe('refreshed-access-token');
    const stored = await db.query.integrationConnection.findFirst({ where: { id: connection.id } });
    expect(stored?.accessToken?.startsWith('enc:v1:')).toBe(true);
    expect(stored?.accessToken).not.toContain('refreshed-access-token');
    expect(stored?.status).toBe('active');
  });

  test('shares one refresh between concurrent requests', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedMailboxOnExpiredConnection(userId);

    await Promise.all([
      searchMail(cookieHeader),
      searchMail(cookieHeader),
      searchMail(cookieHeader),
    ]);

    const refreshes = providerHttp.tokenRequests.filter(
      (request) => request.form.get('grant_type') === 'refresh_token',
    );
    expect(refreshes).toHaveLength(1);
  });

  test('flags a rejected connection, asks to reconnect and notifies the owner once', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedMailboxOnExpiredConnection(userId);
    rejectProviderRefresh('google');

    const first = await searchMail(cookieHeader);
    const second = await searchMail(cookieHeader);

    expect(first.status).toBe(StatusCodes.CONFLICT);
    expect(await first.json()).toMatchObject({ error: 'Reconnect your mailbox' });
    expect(second.status).toBe(StatusCodes.CONFLICT);
    const connections = await listConnections(cookieHeader);
    expect(connections[0]?.status).toBe('needs_reauth');
    const notifications = needsReauthNotifications().filter(
      (job) => job.type === 'integration_needs_reauth',
    );
    expect(notifications).toEqual([
      {
        userId,
        type: 'integration_needs_reauth',
        data: { connectionId: connection.id, provider: 'google' },
      },
    ]);
  });

  test('shows the mailbox as needing a reconnect once its connection is rejected', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedMailboxOnExpiredConnection(userId);
    rejectProviderRefresh('google');
    await searchMail(cookieHeader);

    const response = await app.request('/email/account', { headers: { cookie: cookieHeader } });

    const body = z
      .object({ account: z.object({ syncState: z.string() }) })
      .parse(await response.json());
    expect(body.account.syncState).toBe('reauth_required');
  });
});
