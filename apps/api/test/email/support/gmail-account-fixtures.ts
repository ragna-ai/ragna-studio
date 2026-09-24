// apps/api/test/email/support/gmail-account-fixtures.ts
import { db } from '@repo/database';
import { account } from '@repo/database/schema';
import { assertConnectedToTestDatabase } from '@repo/testing';

const GOOGLE_PROVIDER_ID = 'google';
const GOOGLE_ISSUER = 'https://accounts.google.com';

// Matches email-provider.service.ts's GMAIL_MODIFY_SCOPE constant.
const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const BASE_GOOGLE_SIGNIN_SCOPES = ['openid', 'email', 'profile'];

export interface SeedGoogleAccountParams {
  userId: string;
  accessToken?: string;
  googleAccountId?: string;
}

export interface SeedGoogleAccountResult {
  accessToken: string;
  googleAccountId: string;
}

async function insertGoogleAccount({
  userId,
  accessToken,
  googleAccountId,
  scopes,
}: SeedGoogleAccountParams & { scopes: string[] }): Promise<SeedGoogleAccountResult> {
  await assertConnectedToTestDatabase();

  const resolvedAccessToken = accessToken ?? `test-google-token-${crypto.randomUUID()}`;
  const resolvedGoogleAccountId = googleAccountId ?? `test-google-account-${crypto.randomUUID()}`;
  const now = new Date();

  await db.insert(account).values({
    userId,
    accountId: resolvedGoogleAccountId,
    providerId: GOOGLE_PROVIDER_ID,
    issuer: GOOGLE_ISSUER,
    accessToken: resolvedAccessToken,
    accessTokenExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    scope: scopes.join(','),
    createdAt: now,
    updatedAt: now,
  });

  return { accessToken: resolvedAccessToken, googleAccountId: resolvedGoogleAccountId };
}

/**
 * A Google account linked with the `gmail.modify` scope - the state
 * `POST /email/account/connect` and every other email route require
 * (`assertGmailScope`, email-provider.service.ts).
 */
export function seedGmailLinkedAccount(
  params: SeedGoogleAccountParams,
): Promise<SeedGoogleAccountResult> {
  return insertGoogleAccount({ ...params, scopes: [...BASE_GOOGLE_SIGNIN_SCOPES, GMAIL_MODIFY_SCOPE] });
}

/**
 * A Google account linked for plain sign-in only, missing `gmail.modify` -
 * for asserting the "connect Gmail without having granted the scope" 4xx
 * path.
 */
export function seedGoogleAccountWithoutGmailScope(
  params: SeedGoogleAccountParams,
): Promise<SeedGoogleAccountResult> {
  return insertGoogleAccount({ ...params, scopes: [...BASE_GOOGLE_SIGNIN_SCOPES] });
}
