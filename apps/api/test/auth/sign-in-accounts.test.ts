import { config } from '@repo/config';
import { db } from '@repo/database';
import { account } from '@repo/database/schema';
import {
  resetProviderMocks,
  seedAuthenticatedUser,
  setProviderProfile,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { app } from '../../src/app';

const authUrlSchema = z.object({ url: z.string() });

type SignInProvider = 'google' | 'microsoft' | 'linkedin';

function jsonPost(path: string, body: object, cookieHeader?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: config.appUrl,
  };
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function startSignIn(provider: SignInProvider): Promise<URL> {
  const response = await jsonPost('/auth/sign-in/social', {
    provider,
    callbackURL: `${config.appUrl}/`,
  });
  return new URL(authUrlSchema.parse(await response.json()).url);
}

function scopesOf(url: URL): string[] {
  return (url.searchParams.get('scope') ?? '').split(/[ ,]/).filter(Boolean);
}

interface LinkAttempt {
  location: URL;
  setCookie: string[];
}

async function linkAccount(provider: SignInProvider, cookieHeader: string): Promise<LinkAttempt> {
  const start = await jsonPost(
    '/auth/link-social',
    { provider, callbackURL: `${config.appUrl}/account` },
    cookieHeader,
  );
  const authorizeUrl = new URL(authUrlSchema.parse(await start.json()).url);
  const stateCookies = start.headers.getSetCookie().map((cookie) => cookie.split(';')[0] ?? '');

  const callback = await app.request(
    `/auth/callback/${provider}?code=link-code&state=${authorizeUrl.searchParams.get('state')}`,
    { headers: { cookie: [cookieHeader].concat(stateCookies).join('; ') }, redirect: 'manual' },
  );

  return {
    location: new URL(callback.headers.get('location') ?? config.appUrl, config.appUrl),
    setCookie: callback.headers.getSetCookie(),
  };
}

async function listAccounts(userId: string) {
  return db.query.account.findMany({ where: { userId } });
}

describe('sign-in permissions', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('Google sign-in asks for identity only and no consent screen every time', async () => {
    const url = await startSignIn('google');

    expect(scopesOf(url).sort()).toEqual(['email', 'openid', 'profile']);
    expect(url.searchParams.get('prompt')).not.toBe('consent');
    expect(url.searchParams.get('access_type')).toBeNull();
  });

  test('Microsoft sign-in asks for no mail permission', async () => {
    const url = await startSignIn('microsoft');

    expect(scopesOf(url).some((scope) => scope.toLowerCase().startsWith('mail.'))).toBe(false);
  });

  test('LinkedIn sign-in asks for no posting permission', async () => {
    const url = await startSignIn('linkedin');

    expect(scopesOf(url)).not.toContain('w_member_social');
    expect(scopesOf(url).sort()).toEqual(['email', 'openid', 'profile']);
  });
});

describe('linking sign-in accounts', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('links an account that carries the login email', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser({ email: 'anna@example.com' });
    setProviderProfile('google', { id: 'google-sub-1', email: 'anna@example.com', name: 'Anna' });

    const attempt = await linkAccount('google', cookieHeader);

    expect(attempt.location.searchParams.get('error')).toBeNull();
    expect((await listAccounts(userId)).map((row) => row.providerId)).toEqual(['google']);
  });

  test('refuses an account with another email than the login email', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser({ email: 'anna@example.com' });
    setProviderProfile('google', { id: 'google-sub-2', email: 'other@example.com', name: 'Other' });

    const attempt = await linkAccount('google', cookieHeader);

    expect(attempt.location.searchParams.get('error')).not.toBeNull();
    expect(await listAccounts(userId)).toHaveLength(0);
  });

  test('refuses a second Microsoft account with the same email', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser({ email: 'anna@example.com' });
    await db.insert(account).values({
      userId,
      accountId: 'microsoft-sub-1',
      providerId: 'microsoft',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setProviderProfile('microsoft', {
      id: 'microsoft-sub-2',
      email: 'anna@example.com',
      name: 'Anna',
    });

    await linkAccount('microsoft', cookieHeader);

    const rows = await listAccounts(userId);
    expect(rows.map((row) => row.accountId)).toEqual(['microsoft-sub-1']);
  });
});
