// apps/api/test/email/support/microsoft-account-fixtures.ts
//
// Seeds a better-auth `account` row for the 'microsoft' provider, mirroring
// gmail-account-fixtures.ts's seedGmailLinkedAccount. email-provider.
// service.ts's getMailProviderScopeStatus reads this row's `scope` column
// directly (a comma-separated list), so tests seed it here instead of
// driving a real OAuth consent flow. Two scope forms are covered because
// Microsoft's token response may echo scopes as full resource URIs or as
// short names (docs/email/microsoft-provider-prd.md's open question,
// resolved by making the check accept both).
import { db } from '@repo/database';
import { account } from '@repo/database/schema';
import { assertConnectedToTestDatabase } from '@repo/testing';

const MICROSOFT_PROVIDER_ID = 'microsoft';

const BASE_MICROSOFT_SIGNIN_SCOPES = ['openid', 'profile', 'email', 'User.Read', 'offline_access'];
const MICROSOFT_MAIL_SCOPES_FULL_URI = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
];
const MICROSOFT_MAIL_SCOPES_SHORT = ['Mail.ReadWrite', 'Mail.Send'];

export interface SeedMicrosoftAccountParams {
  userId: string;
  accessToken?: string;
  microsoftAccountId?: string;
}

export interface SeedMicrosoftAccountResult {
  accessToken: string;
  microsoftAccountId: string;
}

async function insertMicrosoftAccount({
  userId,
  accessToken,
  microsoftAccountId,
  scopes,
}: SeedMicrosoftAccountParams & { scopes: string[] }): Promise<SeedMicrosoftAccountResult> {
  await assertConnectedToTestDatabase();

  const resolvedAccessToken = accessToken ?? `test-microsoft-token-${crypto.randomUUID()}`;
  const resolvedMicrosoftAccountId = microsoftAccountId ?? `test-microsoft-account-${crypto.randomUUID()}`;
  const now = new Date();

  await db.insert(account).values({
    userId,
    accountId: resolvedMicrosoftAccountId,
    providerId: MICROSOFT_PROVIDER_ID,
    accessToken: resolvedAccessToken,
    accessTokenExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    scope: scopes.join(','),
    createdAt: now,
    updatedAt: now,
  });

  return { accessToken: resolvedAccessToken, microsoftAccountId: resolvedMicrosoftAccountId };
}

/**
 * A Microsoft account linked with Mail.ReadWrite + Mail.Send, scopes stored
 * as full resource URIs - the state `POST /email/account/connect` and every
 * other email route require for a Microsoft mailbox.
 */
export function seedMicrosoftLinkedAccount(
  params: SeedMicrosoftAccountParams,
): Promise<SeedMicrosoftAccountResult> {
  return insertMicrosoftAccount({
    ...params,
    scopes: [...BASE_MICROSOFT_SIGNIN_SCOPES, ...MICROSOFT_MAIL_SCOPES_FULL_URI],
  });
}

/**
 * Same as `seedMicrosoftLinkedAccount`, but with the mail scopes stored as
 * short names instead of full URIs - proves the scope check accepts both
 * forms.
 */
export function seedMicrosoftLinkedAccountWithShortScopes(
  params: SeedMicrosoftAccountParams,
): Promise<SeedMicrosoftAccountResult> {
  return insertMicrosoftAccount({
    ...params,
    scopes: [...BASE_MICROSOFT_SIGNIN_SCOPES, ...MICROSOFT_MAIL_SCOPES_SHORT],
  });
}

/**
 * A Microsoft account linked for plain sign-in only, missing Mail.ReadWrite/
 * Mail.Send - for asserting the "connect Outlook without having granted the
 * scope" 4xx path.
 */
export function seedMicrosoftAccountWithoutMailScope(
  params: SeedMicrosoftAccountParams,
): Promise<SeedMicrosoftAccountResult> {
  return insertMicrosoftAccount({ ...params, scopes: [...BASE_MICROSOFT_SIGNIN_SCOPES] });
}
