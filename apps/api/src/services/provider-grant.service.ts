// apps/api/src/services/provider-grant.service.ts

import { auth } from '@repo/auth/server';
import {
  clearAccountTokensByUserIdAndProviders,
  listAccountsByUserIdAndProvider,
} from '@repo/database';
import type { Account } from '@repo/database/schema';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';

const GOOGLE_PROVIDER_ID = 'google';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface RevokeProviderGrantsParams {
  userId: string;
  providerIds: string[];
}

async function revokeGoogleGrant(account: Account): Promise<void> {
  const { accessToken } = await auth.api.getAccessToken({
    body: { accountId: account.id, userId: account.userId },
  });
  if (!accessToken) return;

  const response = await fetch(GOOGLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: accessToken }),
  });
  if (!response.ok) {
    throw new Error(`Google revoke responded with ${response.status}`);
  }
}

async function revokeAllGoogleGrants({ userId }: { userId: string }): Promise<void> {
  const accounts = await listAccountsByUserIdAndProvider({
    userId,
    providerId: GOOGLE_PROVIDER_ID,
  });

  for (const account of accounts) {
    const { error } = await tryCatch(() => revokeGoogleGrant(account));
    if (error !== null) {
      logger.error('Failed to revoke Google grant', error);
    }
  }
}

/**
 * Revokes every Google grant of the user (Microsoft has no client-side revocation) and
 * clears the stored tokens. A failed provider call is logged, never thrown.
 */
export async function revokeProviderGrants({
  userId,
  providerIds,
}: RevokeProviderGrantsParams): Promise<void> {
  if (providerIds.includes(GOOGLE_PROVIDER_ID)) {
    await revokeAllGoogleGrants({ userId });
  }

  const { error: clearError } = await tryCatch(() =>
    clearAccountTokensByUserIdAndProviders({ userId, providerIds }),
  );
  if (clearError !== null) {
    logger.error('Failed to clear provider tokens', clearError);
  }
}
