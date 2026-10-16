import { db } from '@repo/database';
import { account } from '@repo/database/schema';
import { sql } from '@repo/database';
import { spyOn } from 'bun:test';

export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface GoogleRevokeMock {
  revokedTokens: () => string[];
  restore: () => void;
}

/** Intercepts the Google revoke endpoint at the fetch level, other URLs pass through. */
export function mockGoogleRevoke({ status = 200 }: { status?: number } = {}): GoogleRevokeMock {
  const originalFetch = globalThis.fetch;
  const revoked: string[] = [];
  const interceptingFetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url !== GOOGLE_REVOKE_URL) return originalFetch(input, init);
    const params = new URLSearchParams(String(init?.body));
    revoked.push(params.get('token') ?? '');
    return new Response('{}', { status });
  };
  const spy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(interceptingFetch, { preconnect: originalFetch.preconnect }),
  );

  return { revokedTokens: () => revoked, restore: () => spy.mockRestore() };
}

/** Gives the user's provider account the full token set a real sign-in stores. */
export async function fillProviderTokens({
  userId,
  providerId,
}: {
  userId: string;
  providerId: string;
}): Promise<void> {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  await db
    .update(account)
    .set({
      refreshToken: 'refresh-token',
      idToken: 'id-token',
      refreshTokenExpiresAt: future,
    })
    .where(sql`${account.userId} = ${userId} and ${account.providerId} = ${providerId}`);
}

export async function loadProviderAccount({
  userId,
  providerId,
}: {
  userId: string;
  providerId: string;
}) {
  return db.query.account.findFirst({ where: { userId, providerId } });
}

export async function loadProviderAccounts({
  userId,
  providerId,
}: {
  userId: string;
  providerId: string;
}) {
  return db.query.account.findMany({ where: { userId, providerId } });
}
