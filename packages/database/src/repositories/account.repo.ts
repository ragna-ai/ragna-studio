import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import type { Account } from '../schema';
import { account } from '../schema';

/**
 * Looks up a user's linked social account for a given better-auth provider
 * (e.g. `linkedin`). `account.accountId` holds the provider's user id, which
 * for LinkedIn is the `sub` used to build the author URN.
 */
export async function getAccountByUserIdAndProvider({
  userId,
  providerId,
}: {
  userId: string;
  providerId: string;
}): Promise<Account | null> {
  const account = await db.query.account.findFirst({
    where: { userId, providerId },
  });

  return account ?? null;
}

/** All of a user's linked accounts for one provider; a user can link several (e.g. two Google accounts). */
export async function listAccountsByUserIdAndProvider({
  userId,
  providerId,
}: {
  userId: string;
  providerId: string;
}): Promise<Account[]> {
  return db.query.account.findMany({ where: { userId, providerId } });
}

/**
 * Nulls the stored OAuth tokens and scope of a user's accounts for the given
 * providers. The rows stay: they are the login identity.
 */
export async function clearAccountTokensByUserIdAndProviders({
  userId,
  providerIds,
}: {
  userId: string;
  providerIds: string[];
}): Promise<void> {
  await db
    .update(account)
    .set({
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
    })
    .where(and(eq(account.userId, userId), inArray(account.providerId, providerIds)));
}
