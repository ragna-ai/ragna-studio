import { createEmailAccount, db } from '@repo/database';
import {
  providerHttp,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedGmailConnection,
  seedOutlookConnection,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import { listConnections } from './support/connect-flow';

function removeConnection(cookieHeader: string, connectionId: string) {
  return app.request(`/integration/connection/${connectionId}`, {
    method: 'DELETE',
    headers: { cookie: cookieHeader },
  });
}

describe('removing a connection', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request(`/integration/connection/${Bun.randomUUIDv7()}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('revokes a Google connection at the provider and takes the mailbox with it', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection, refreshToken } = await seedGmailConnection({ userId });
    const mailbox = await createEmailAccount({
      userId,
      connectionId: connection.id,
      provider: 'gmail',
      email: 'anna@example.com',
    });

    const response = await removeConnection(cookieHeader, connection.id);

    expect(response.status).toBe(StatusCodes.OK);
    expect(providerHttp.revokeRequests).toEqual([
      { provider: 'google', token: refreshToken ?? 'missing' },
    ]);
    expect(await listConnections(cookieHeader)).toHaveLength(0);
    expect(await db.query.emailAccount.findFirst({ where: { id: mailbox.id } })).toBeUndefined();
  });

  test('removes a Microsoft connection without a revoke call', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedOutlookConnection({ userId });

    const response = await removeConnection(cookieHeader, connection.id);

    expect(response.status).toBe(StatusCodes.OK);
    expect(providerHttp.revokeRequests).toHaveLength(0);
    expect(await listConnections(cookieHeader)).toHaveLength(0);
  });

  test("answers 404 for another user's connection and keeps it", async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    const { connection } = await seedGmailConnection({ userId: owner.userId });

    const response = await removeConnection(other.cookieHeader, connection.id);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await listConnections(owner.cookieHeader)).toHaveLength(1);
    expect(providerHttp.revokeRequests).toHaveLength(0);
  });
});
