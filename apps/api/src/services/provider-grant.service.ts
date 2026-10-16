// apps/api/src/services/provider-grant.service.ts

import { auth } from '@repo/auth/server';
import {
  clearAccountTokensByUserIdAndProviders,
  getAccountByUserIdAndProvider,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';

const GOOGLE_PROVIDER_ID = 'google';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface RevokeProviderGrantsParams {
  userId: string;
  providerIds: string[];
}

async function revokeGoogleGrant({ userId }: { userId: string }): Promise<void> {
  const account = await getAccountByUserIdAndProvider({ userId, providerId: GOOGLE_PROVIDER_ID });
  if (!account) return;

  const { accessToken } = await auth.api.getAccessToken({
    body: { accountId: account.id, userId },
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

/**
 * Revokes the Google grant (Microsoft has no client-side revocation) and
 * clears the stored tokens. A failed provider call is logged, never thrown.
 */
export async function revokeProviderGrants({
  userId,
  providerIds,
}: RevokeProviderGrantsParams): Promise<void> {
  if (providerIds.includes(GOOGLE_PROVIDER_ID)) {
    const { error } = await tryCatch(() => revokeGoogleGrant({ userId }));
    if (error !== null) {
      logger.error('Failed to revoke Google grant', error);
    }
  }

  const { error: clearError } = await tryCatch(() =>
    clearAccountTokensByUserIdAndProviders({ userId, providerIds }),
  );
  if (clearError !== null) {
    logger.error('Failed to clear provider tokens', clearError);
  }
}
