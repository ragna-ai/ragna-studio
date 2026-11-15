import { config } from '@repo/config';
import { db } from '@repo/database';
import { resetProviderMocks, setProviderProfile, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { app } from '../../src/app';

const authUrlSchema = z.strictObject({ url: z.string(), redirect: z.boolean() });

interface SignInOptions {
  additionalData?: Record<string, string>;
  acceptLanguage?: string;
}

async function signInWithGoogle({ additionalData, acceptLanguage }: SignInOptions = {}) {
  const start = await app.request('/auth/sign-in/social', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: config.appUrl },
    body: JSON.stringify({
      provider: 'google',
      callbackURL: `${config.appUrl}/`,
      ...(additionalData ? { additionalData } : {}),
    }),
  });
  const authorizeUrl = new URL(authUrlSchema.parse(await start.json()).url);
  const stateCookies = start.headers.getSetCookie().map((cookie) => cookie.split(';')[0] ?? '');

  await app.request(
    `/auth/callback/google?code=sign-in-code&state=${authorizeUrl.searchParams.get('state')}`,
    {
      headers: {
        cookie: stateCookies.join('; '),
        ...(acceptLanguage ? { 'accept-language': acceptLanguage } : {}),
      },
      redirect: 'manual',
    },
  );
}

async function localeOf(email: string): Promise<string | null | undefined> {
  const row = await db.query.user.findFirst({ where: { email } });
  return row?.locale;
}

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  setProviderProfile('google', { id: 'google-sub-1', email: 'anna@example.com', name: 'Anna' });
});

describe('language of a new user', () => {
  test('takes the language the app sent at sign-in', async () => {
    await signInWithGoogle({ additionalData: { locale: 'en' }, acceptLanguage: 'de-AT' });

    expect(await localeOf('anna@example.com')).toBe('en');
  });

  test('takes the first supported browser language when the app sent none', async () => {
    await signInWithGoogle({ acceptLanguage: 'fr;q=1,en-GB;q=0.9,de;q=0.5' });

    expect(await localeOf('anna@example.com')).toBe('en');
  });

  test('falls back to German when nothing names a supported language', async () => {
    await signInWithGoogle({ acceptLanguage: 'fr-FR' });

    expect(await localeOf('anna@example.com')).toBe('de');
  });

  test('ignores an unsupported language sent by the app', async () => {
    await signInWithGoogle({ additionalData: { locale: 'xx' }, acceptLanguage: 'en' });

    expect(await localeOf('anna@example.com')).toBe('en');
  });

  test('keeps the stored language when an existing user signs in again', async () => {
    await signInWithGoogle({ additionalData: { locale: 'en' } });

    await signInWithGoogle({ additionalData: { locale: 'de' } });

    expect(await localeOf('anna@example.com')).toBe('en');
  });
});
