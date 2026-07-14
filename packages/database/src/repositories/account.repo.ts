import { db } from '../db';
import type { Account } from '../schema';

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
