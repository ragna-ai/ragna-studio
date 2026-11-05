import { db, getConnectionById } from '@repo/database';
import { createIntegrationTokenGetter } from '@repo/integrations';
import {
  GMAIL_MODIFY_SCOPE,
  providerHttp,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedIntegrationConnection,
  setProviderProfile,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import { callOauthCallback, listConnections, startConnect } from './support/connect-flow';

const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const EMAIL = 'anna@example.com';

function scopesOf(url: URL): string[] {
  return (url.searchParams.get('scope') ?? '').split(' ');
}

async function connectViaFlow(cookieHeader: string, integrationId: string, accountId: string) {
  setProviderProfile('google', { id: accountId, email: EMAIL, name: 'Anna' });
  const { authorizeUrl, state } = await startConnect({ cookieHeader, integrationId });
  await callOauthCallback({ cookieHeader, query: { code: `code-${integrationId}`, state } });
  return authorizeUrl;
}

function unbind(cookieHeader: string, connectionId: string, integrationId: string) {
  return app.request(`/integration/connection/${connectionId}/integrations/${integrationId}`, {
    method: 'DELETE',
    headers: { cookie: cookieHeader },
  });
}

describe('binding integrations to a connection', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('US-1.1: adds Google Drive to the Gmail connection of the same account', async () => {
    const { cookieHeader } = await seedAuthenticatedUser({ email: EMAIL });
    await connectViaFlow(cookieHeader, 'gmail', 'google-sub-1');

    const authorizeUrl = await connectViaFlow(cookieHeader, 'google-drive', 'google-sub-1');

    expect(scopesOf(authorizeUrl)).toContain(DRIVE_READONLY_SCOPE);
    expect(scopesOf(authorizeUrl)).toContain(DRIVE_FILE_SCOPE);
    const connections = await listConnections(cookieHeader);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.integrations.sort()).toEqual(['gmail', 'google-drive']);
  });

  test('US-1.1: the authorize URL repeats the scopes the connection already holds', async () => {
    const { cookieHeader } = await seedAuthenticatedUser({ email: EMAIL });
    await connectViaFlow(cookieHeader, 'gmail', 'google-sub-1');

    const authorizeUrl = await connectViaFlow(cookieHeader, 'google-drive', 'google-sub-1');

    expect(scopesOf(authorizeUrl)).toContain(GMAIL_MODIFY_SCOPE);
  });

  test('US-1.2: creates a connection that serves Google Drive only', async () => {
    const { cookieHeader } = await seedAuthenticatedUser({ email: EMAIL });

    await connectViaFlow(cookieHeader, 'google-drive', 'google-sub-1');

    const connections = await listConnections(cookieHeader);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.integrations).toEqual(['google-drive']);
    expect(connections[0]?.scopes).not.toContain(GMAIL_MODIFY_SCOPE);
  });

  test('connecting a different Google account starts over with the chosen integration', async () => {
    const { cookieHeader } = await seedAuthenticatedUser({ email: EMAIL });
    await connectViaFlow(cookieHeader, 'gmail', 'google-sub-1');
    await connectViaFlow(cookieHeader, 'google-drive', 'google-sub-1');

    await connectViaFlow(cookieHeader, 'google-drive', 'google-sub-2');

    const connections = await listConnections(cookieHeader);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.integrations).toEqual(['google-drive']);
  });

  test('US-1.3: turning off Google Drive keeps Gmail and the connection', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedIntegrationConnection({
      userId,
      provider: 'google',
      integrationIds: ['gmail', 'google-drive'],
    });

    const response = await unbind(cookieHeader, connection.id, 'google-drive');

    expect(response.status).toBe(StatusCodes.NO_CONTENT);
    const [remaining] = await listConnections(cookieHeader);
    expect(remaining?.integrations).toEqual(['gmail']);
    expect(providerHttp.revokeRequests).toHaveLength(0);
    const getDriveToken = createIntegrationTokenGetter({
      connectionId: connection.id,
      integrationId: 'google-drive',
    });
    await expect(getDriveToken()).rejects.toThrow('google-drive turned off');
    const getGmailToken = createIntegrationTokenGetter({
      connectionId: connection.id,
      integrationId: 'gmail',
    });
    expect(await getGmailToken()).toBeString();
  });

  test('US-1.5: turning off the last integration revokes and removes the connection', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection, refreshToken } = await seedIntegrationConnection({
      userId,
      provider: 'google',
      integrationIds: ['google-drive'],
    });

    const response = await unbind(cookieHeader, connection.id, 'google-drive');

    expect(response.status).toBe(StatusCodes.NO_CONTENT);
    expect(providerHttp.revokeRequests).toEqual([
      { provider: 'google', token: refreshToken ?? 'missing' },
    ]);
    expect(await getConnectionById({ id: connection.id })).toBeNull();
  });

  test('answers 404 for another user and keeps the integration', async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    const { connection } = await seedIntegrationConnection({
      userId: owner.userId,
      provider: 'google',
      integrationIds: ['gmail', 'google-drive'],
    });

    const response = await unbind(other.cookieHeader, connection.id, 'google-drive');

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    const stored = await db.query.integrationConnection.findFirst({ where: { id: connection.id } });
    expect(stored?.enabledIntegrations.sort()).toEqual(['gmail', 'google-drive']);
  });

  test('rejects an unknown integration id', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { connection } = await seedIntegrationConnection({ userId, provider: 'google' });

    const response = await unbind(cookieHeader, connection.id, 'dropbox');

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request(
      `/integration/connection/${Bun.randomUUIDv7()}/integrations/gmail`,
      { method: 'DELETE' },
    );

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});
