import {
  resetProviderMocks,
  seedAuthenticatedUser,
  seedGmailConnection,
  seedLinkedinConnection,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { listConnections } from './support/connect-flow';

const catalogSchema = z.strictObject({
  integrations: z.array(
    z.strictObject({
      id: z.string(),
      provider: z.enum(['google', 'microsoft', 'linkedin']),
      category: z.enum(['mail', 'calendar', 'files', 'social']),
      authType: z.literal('oauth2'),
    }),
  ),
});

describe('listing connections', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const catalog = await app.request('/integration/catalog');
    const list = await app.request('/integration/connection');

    expect(catalog.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(list.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('lists the catalog of integrations a user can connect', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/integration/catalog', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const { integrations } = catalogSchema.parse(await response.json());
    expect(integrations.map((integration) => integration.id).sort()).toEqual([
      'gmail',
      'linkedin-posting',
      'outlook-mail',
    ]);
  });

  test('shows each connection with provider, account email, integrations and status', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedGmailConnection({ userId, externalEmail: 'anna@example.com' });
    await seedLinkedinConnection({ userId, externalEmail: 'anna@brand.example' });

    const connections = await listConnections(cookieHeader);

    expect(connections).toHaveLength(2);
    expect(connections).toContainEqual(
      expect.objectContaining({
        provider: 'google',
        externalEmail: 'anna@example.com',
        integrations: ['gmail'],
        status: 'active',
      }),
    );
    expect(connections).toContainEqual(
      expect.objectContaining({
        provider: 'linkedin',
        externalEmail: 'anna@brand.example',
        integrations: ['linkedin-posting'],
      }),
    );
  });

  test('flags a connection that needs to be reconnected', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedGmailConnection({ userId, status: 'needs_reauth' });

    const connections = await listConnections(cookieHeader);

    expect(connections[0]?.status).toBe('needs_reauth');
  });

  test("never lists another user's connections", async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    await seedGmailConnection({ userId: owner.userId });

    expect(await listConnections(other.cookieHeader)).toHaveLength(0);
  });

  test('never returns an access or refresh token', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { accessToken, refreshToken } = await seedGmailConnection({ userId });

    const response = await app.request('/integration/connection', {
      headers: { cookie: cookieHeader },
    });
    const rawBody = await response.text();

    expect(rawBody).not.toContain(accessToken);
    expect(rawBody).not.toContain(refreshToken ?? 'no-refresh-token');
    expect(rawBody).not.toContain('enc:v1:');
    expect(rawBody.toLowerCase()).not.toContain('token');
  });
});
