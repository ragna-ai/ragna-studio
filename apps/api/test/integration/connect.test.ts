import { config } from '@repo/config';
import { db } from '@repo/database';
import {
  GMAIL_MODIFY_SCOPE,
  providerHttp,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedIntegrationConnection,
  setProviderGrantedScopes,
  setProviderProfile,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import { callOauthCallback, listConnections, startConnect } from './support/connect-flow';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function scopesOf(url: URL): string[] {
  return (url.searchParams.get('scope') ?? '').split(' ');
}

describe('connecting an integration', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects a connect request without a session', async () => {
    const response = await app.request('/integration/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ integrationId: 'gmail', returnPath: '/' }),
    });

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('rejects an integration that is not in the catalog', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/integration/connect', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ integrationId: 'unknown', returnPath: '/' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('asks the provider only for the permissions of the chosen integration', async () => {
    const email = 'anna@example.com';
    const { cookieHeader } = await seedAuthenticatedUser({ email });
    setProviderProfile('google', { id: 'google-sub-1', email, name: 'Anna' });

    const { authorizeUrl, state } = await startConnect({ cookieHeader, integrationId: 'gmail' });

    expect(authorizeUrl.hostname).toBe('accounts.google.com');
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(scopesOf(authorizeUrl)).toContain(GMAIL_MODIFY_SCOPE);
    expect(scopesOf(authorizeUrl)).not.toContain(CALENDAR_SCOPE);

    const callback = await callOauthCallback({ cookieHeader, query: { code: 'code-1', state } });

    expect(callback.status).toBe(StatusCodes.MOVED_TEMPORARILY);
    expect(callback.headers.get('location')).toBe(`${config.appUrl}/settings/connections`);

    const connections = await listConnections(cookieHeader);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      provider: 'google',
      externalEmail: email,
      displayName: 'Anna',
      integrations: ['gmail'],
      status: 'active',
    });
  });

  test('keeps one Google connection when more permissions are added', async () => {
    const email = 'anna@example.com';
    const { userId, cookieHeader } = await seedAuthenticatedUser({ email });
    await seedIntegrationConnection({
      userId,
      provider: 'google',
      externalEmail: email,
      scopes: ['openid', 'email', 'profile', CALENDAR_SCOPE],
    });
    setProviderProfile('google', { id: 'google-sub-1', email, name: 'Anna' });
    setProviderGrantedScopes('google', [
      'openid',
      'email',
      'profile',
      CALENDAR_SCOPE,
      GMAIL_MODIFY_SCOPE,
    ]);

    const { authorizeUrl, state } = await startConnect({ cookieHeader, integrationId: 'gmail' });

    expect(scopesOf(authorizeUrl)).toContain(GMAIL_MODIFY_SCOPE);
    expect(scopesOf(authorizeUrl)).toContain(CALENDAR_SCOPE);

    await callOauthCallback({ cookieHeader, query: { code: 'code-2', state } });

    const connections = await listConnections(cookieHeader);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.scopes).toContain(CALENDAR_SCOPE);
    expect(connections[0]?.scopes).toContain(GMAIL_MODIFY_SCOPE);
    expect(connections[0]?.integrations).toEqual(['gmail']);
  });

  test.each([
    { provider: 'google' as const, integrationId: 'gmail' },
    { provider: 'microsoft' as const, integrationId: 'outlook-mail' },
  ])('refuses a $provider account with another email than the login email', async (scenario) => {
    const { cookieHeader } = await seedAuthenticatedUser({ email: 'anna@example.com' });
    setProviderProfile(scenario.provider, {
      id: 'other-sub',
      email: 'someone-else@example.com',
      name: 'Someone',
    });

    const { state } = await startConnect({ cookieHeader, integrationId: scenario.integrationId });
    const callback = await callOauthCallback({ cookieHeader, query: { code: 'code-3', state } });

    const location = new URL(callback.headers.get('location') ?? '');
    expect(callback.status).toBe(StatusCodes.MOVED_TEMPORARILY);
    expect(location.searchParams.get('integration_error')).toBe('email_mismatch');
    expect(await listConnections(cookieHeader)).toHaveLength(0);
  });

  test('accepts a Microsoft account whose email only differs in case', async () => {
    const { cookieHeader } = await seedAuthenticatedUser({ email: 'anna@example.com' });
    setProviderProfile('microsoft', { id: 'ms-1', email: 'Anna@Example.com', name: 'Anna' });

    const { state } = await startConnect({ cookieHeader, integrationId: 'outlook-mail' });
    await callOauthCallback({ cookieHeader, query: { code: 'code-4', state } });

    expect(await listConnections(cookieHeader)).toHaveLength(1);
  });

  test('accepts a LinkedIn account whose email differs from the login email', async () => {
    const { cookieHeader } = await seedAuthenticatedUser({ email: 'anna@example.com' });
    setProviderProfile('linkedin', { id: 'li-1', email: 'anna@brand.example', name: 'Anna' });

    const { state } = await startConnect({ cookieHeader, integrationId: 'linkedin-posting' });
    const callback = await callOauthCallback({ cookieHeader, query: { code: 'code-5', state } });

    expect(
      new URL(callback.headers.get('location') ?? '').searchParams.has('integration_error'),
    ).toBe(false);
    const connections = await listConnections(cookieHeader);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      provider: 'linkedin',
      externalEmail: 'anna@brand.example',
      integrations: ['linkedin-posting'],
    });
  });

  test('stores the tokens encrypted', async () => {
    const email = 'anna@example.com';
    const { userId, cookieHeader } = await seedAuthenticatedUser({ email });
    setProviderProfile('google', { id: 'google-sub-1', email, name: 'Anna' });

    const { state } = await startConnect({ cookieHeader, integrationId: 'gmail' });
    await callOauthCallback({ cookieHeader, query: { code: 'code-6', state } });

    const stored = await db.query.integrationConnection.findFirst({ where: { userId } });
    expect(stored?.accessToken?.startsWith('enc:v1:')).toBe(true);
    expect(stored?.refreshToken?.startsWith('enc:v1:')).toBe(true);
    expect(stored?.accessToken).not.toContain('granted-access-token');
  });

  test('refuses a state a second time', async () => {
    const email = 'anna@example.com';
    const { cookieHeader } = await seedAuthenticatedUser({ email });
    setProviderProfile('google', { id: 'google-sub-1', email, name: 'Anna' });
    const { state } = await startConnect({ cookieHeader, integrationId: 'gmail' });
    await callOauthCallback({ cookieHeader, query: { code: 'code-7', state } });
    const exchangesBefore = providerHttp.tokenRequests.length;

    const replay = await callOauthCallback({ cookieHeader, query: { code: 'code-7', state } });

    expect(
      new URL(replay.headers.get('location') ?? '').searchParams.get('integration_error'),
    ).toBe('invalid_state');
    expect(providerHttp.tokenRequests).toHaveLength(exchangesBefore);
  });

  test('refuses a state another user started', async () => {
    const starter = await seedAuthenticatedUser({ email: 'anna@example.com' });
    const other = await seedAuthenticatedUser({ email: 'ben@example.com' });
    const { state } = await startConnect({
      cookieHeader: starter.cookieHeader,
      integrationId: 'gmail',
    });

    const callback = await callOauthCallback({
      cookieHeader: other.cookieHeader,
      query: { code: 'code-8', state },
    });

    expect(
      new URL(callback.headers.get('location') ?? '').searchParams.get('integration_error'),
    ).toBe('invalid_state');
    expect(await listConnections(other.cookieHeader)).toHaveLength(0);
    expect(await listConnections(starter.cookieHeader)).toHaveLength(0);
  });

  test('sends the user back with an error when the provider denies access', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    const { state } = await startConnect({
      cookieHeader,
      integrationId: 'gmail',
      returnPath: '/settings/email',
    });

    const callback = await callOauthCallback({
      cookieHeader,
      query: { error: 'access_denied', state },
    });

    const location = new URL(callback.headers.get('location') ?? '');
    expect(location.pathname).toBe('/settings/email');
    expect(location.searchParams.get('integration_error')).toBe('access_denied');
  });

  test('falls back to the connections page for a return path outside the app', async () => {
    const email = 'anna@example.com';
    const { cookieHeader } = await seedAuthenticatedUser({ email });
    setProviderProfile('google', { id: 'google-sub-1', email, name: 'Anna' });
    const { state } = await startConnect({
      cookieHeader,
      integrationId: 'gmail',
      returnPath: 'https://evil.example/steal',
    });

    const callback = await callOauthCallback({ cookieHeader, query: { code: 'code-9', state } });

    expect(callback.headers.get('location')).toBe(`${config.appUrl}/settings/connections`);
  });
});
