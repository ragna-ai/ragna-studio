// apps/api/test/email/support/gmail-account-fixtures.ts
//
// Seeds a better-auth `account` row for the 'google' provider, mirroring
// packages/testing/src/social/social-account-fixtures.ts's
// seedLinkedinAccount (see that file's doc comment for why a plaintext,
// far-future-expiring token round-trips through `auth.api.getAccessToken`
// without a real refresh: packages/auth/src/server/auth.ts never sets
// `account.encryptOAuthTokens`). email-provider.service.ts's
// `getGoogleGmailScopeStatus` reads this row's `scope` column directly (a
// comma-separated list), so tests seed it here instead of driving a real
// OAuth consent flow. Lives in apps/api/test/** (not packages/testing) per
// this suite's file ownership.
import { db } from '@repo/database';
import { account } from '@repo/database/schema';
import { assertConnectedToTestDatabase } from '@repo/testing';

const GOOGLE_PROVIDER_ID = 'google';

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
