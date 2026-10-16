import {
  seedAuthenticatedUser,
  seedGoogleAccountWithoutGmailScope,
  truncateAllTables,
} from '@repo/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import { seedConnectedGmailAccount, seedConnectedMicrosoftAccount } from './support/email-fixtures';
import { resetEmailQueueMock } from './support/email-queue.mock';
import {
  fillProviderTokens,
  loadProviderAccount,
  mockGoogleRevoke,
  type GoogleRevokeMock,
} from './support/provider-grant-fixtures';

let revokeMock: GoogleRevokeMock;

beforeEach(async () => {
  await truncateAllTables();
  resetEmailQueueMock();
});

afterEach(() => {
  revokeMock?.restore();
});

function disconnectRequest(cookieHeader: string) {
  return app.request('/email/account/disconnect', {
    method: 'POST',
    headers: { cookie: cookieHeader },
  });
}

describe('POST /email/account/disconnect provider grants', () => {
  test('gmail: revokes the Google grant once and clears the stored tokens', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });
    await fillProviderTokens({ userId, providerId: 'google' });
    const before = await loadProviderAccount({ userId, providerId: 'google' });
    revokeMock = mockGoogleRevoke();

    const response = await disconnectRequest(cookieHeader);

    expect(response.status).toBe(StatusCodes.OK);
    expect(revokeMock.revokedTokens()).toEqual([before?.accessToken ?? 'missing']);
    const after = await loadProviderAccount({ userId, providerId: 'google' });
    expect(after).toMatchObject({
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
    });
  });

  test('gmail: a failing revoke still disconnects and clears the tokens', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });
    revokeMock = mockGoogleRevoke({ status: 500 });

    const response = await disconnectRequest(cookieHeader);

    expect(response.status).toBe(StatusCodes.OK);
    const after = await loadProviderAccount({ userId, providerId: 'google' });
    expect(after?.accessToken).toBeNull();
    expect(after?.scope).toBeNull();
  });

  test('microsoft: makes no provider call and clears the stored tokens', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedMicrosoftAccount({ userId, cookieHeader });
    await fillProviderTokens({ userId, providerId: 'microsoft' });
    revokeMock = mockGoogleRevoke();

    const response = await disconnectRequest(cookieHeader);

    expect(response.status).toBe(StatusCodes.OK);
    expect(revokeMock.revokedTokens()).toHaveLength(0);
    const after = await loadProviderAccount({ userId, providerId: 'microsoft' });
    expect(after).toMatchObject({ accessToken: null, refreshToken: null, scope: null });
  });

  test('gmail: revokes every linked Google account, not only the first', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });
    const mailAccount = await loadProviderAccount({ userId, providerId: 'google' });
    const signInAccount = await seedGoogleAccountWithoutGmailScope({ userId });
    revokeMock = mockGoogleRevoke();

    const response = await disconnectRequest(cookieHeader);

    expect(response.status).toBe(StatusCodes.OK);
    expect(revokeMock.revokedTokens().toSorted()).toEqual(
      [mailAccount?.accessToken ?? 'missing', signInAccount.accessToken].toSorted(),
    );
  });

  test('keeps the account row as the login identity', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await seedConnectedGmailAccount({ userId, cookieHeader });
    revokeMock = mockGoogleRevoke();

    await disconnectRequest(cookieHeader);

    expect(await loadProviderAccount({ userId, providerId: 'google' })).toBeDefined();
  });
});
