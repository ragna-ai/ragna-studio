// packages/testing/src/social/social-account-fixtures.ts
import { db } from '@repo/database';
import { account } from '@repo/database/schema';
import { assertConnectedToTestDatabase } from '../db/db-guard';

export interface SeedLinkedinAccountParams {
  userId: string;
  accessToken?: string;
  /** LinkedIn's person id, e.g. what `account.accountId` holds in production. */
  linkedinPersonId?: string;
}

export interface SeedLinkedinAccountResult {
  accessToken: string;
  linkedinPersonId: string;
}

/**
 * Inserts a better-auth `account` row directly (there is no `createAccount`
 * repo function; better-auth normally writes this row itself during OAuth
 * sign-in), so `publishSocialPost` (apps/api/src/services/social-post.
 * service.ts) finds a connected LinkedIn account via
 * `getAccountByUserIdAndProvider` and `auth.api.getAccessToken` resolves it
 * without attempting a real token refresh.
 *
 * `accessTokenExpiresAt` is set an hour out on purpose: better-auth's
 * `getValidAccessToken` (better-auth/dist/api/routes/account.mjs) only
 * calls the provider's real `refreshAccessToken` when the current token is
 * expired (or within 5s of expiring). `packages/auth/src/server/auth.ts`
 * also never sets `account.encryptOAuthTokens`, so the plaintext token
 * written here round-trips through `getAccessToken` unchanged, no
 * decryption key needed.
 */
export async function seedLinkedinAccount(
  params: SeedLinkedinAccountParams,
): Promise<SeedLinkedinAccountResult> {
  await assertConnectedToTestDatabase();

  const accessToken = params.accessToken ?? `test-linkedin-token-${crypto.randomUUID()}`;
  const linkedinPersonId = params.linkedinPersonId ?? `test-linkedin-person-${crypto.randomUUID()}`;
  const now = new Date();

  await db.insert(account).values({
    userId: params.userId,
    accountId: linkedinPersonId,
    providerId: 'linkedin',
    accessToken,
    accessTokenExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });

  return { accessToken, linkedinPersonId };
}
