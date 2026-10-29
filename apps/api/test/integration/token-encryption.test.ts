import { config } from '@repo/config';
import { generateAppKey, UndecryptableSecretError } from '@repo/crypto';
import { db, sql } from '@repo/database';
import { integrationConnection } from '@repo/database/schema';
import { getConnectionAccessToken } from '@repo/integrations';
import {
  expireConnectionAccessToken,
  providerHttp,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedGmailConnection,
  truncateAllTables,
} from '@repo/testing';
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';

const TEST_APP_KEY = config.getSecret('APP_KEY');

interface ConfiguredKeys {
  current: string;
  previous: string;
}

function configureKeys({ current, previous }: ConfiguredKeys): Mock<typeof config.getSecret> {
  return spyOn(config, 'getSecret').mockImplementation((key: string) => {
    if (key === 'APP_KEY') return current;
    if (key === 'APP_PREVIOUS_KEYS') return previous;
    throw new Error(`The test did not expect a read of ${key}`);
  });
}

async function storeAccessToken(connectionId: string, accessToken: string | null): Promise<void> {
  await db
    .update(integrationConnection)
    .set({ accessToken })
    .where(sql`${integrationConnection.id} = ${connectionId}`);
}

function changeCiphertextStart(envelope: string): string {
  const ciphertextStart = envelope.lastIndexOf(':') + 1;
  const replacement = envelope[ciphertextStart] === 'A' ? 'B' : 'A';
  return `${envelope.slice(0, ciphertextStart)}${replacement}${envelope.slice(ciphertextStart + 1)}`;
}

describe('stored connection tokens', () => {
  let configuredKeys: Mock<typeof config.getSecret> | null = null;

  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  afterEach(() => {
    configuredKeys?.mockRestore();
    configuredKeys = null;
  });

  test('reads back the token it stored', async () => {
    const { userId } = await seedAuthenticatedUser();
    const { connection, accessToken } = await seedGmailConnection({ userId });

    expect(await getConnectionAccessToken({ connectionId: connection.id })).toBe(accessToken);
  });

  test('reads a token stored before the key was rotated', async () => {
    const { userId } = await seedAuthenticatedUser();
    const { connection, accessToken } = await seedGmailConnection({ userId });
    configuredKeys = configureKeys({ current: generateAppKey(), previous: TEST_APP_KEY });

    expect(await getConnectionAccessToken({ connectionId: connection.id })).toBe(accessToken);
  });

  test('refuses a token stored with a key that is no longer configured', async () => {
    const { userId } = await seedAuthenticatedUser();
    const { connection } = await seedGmailConnection({ userId });
    configuredKeys = configureKeys({ current: generateAppKey(), previous: '' });

    await expect(getConnectionAccessToken({ connectionId: connection.id })).rejects.toBeInstanceOf(
      UndecryptableSecretError,
    );
  });

  test('refuses a token whose stored value was changed', async () => {
    const { userId } = await seedAuthenticatedUser();
    const { connection } = await seedGmailConnection({ userId });
    await storeAccessToken(connection.id, changeCiphertextStart(connection.accessToken ?? ''));

    await expect(getConnectionAccessToken({ connectionId: connection.id })).rejects.toBeInstanceOf(
      UndecryptableSecretError,
    );
  });

  test("refuses a token copied from another user's connection", async () => {
    const owner = await seedAuthenticatedUser({ email: 'owner@example.com' });
    const other = await seedAuthenticatedUser({ email: 'other@example.com' });
    const ownerConnection = await seedGmailConnection({ userId: owner.userId });
    const otherConnection = await seedGmailConnection({ userId: other.userId });
    await storeAccessToken(otherConnection.connection.id, ownerConnection.connection.accessToken);

    await expect(
      getConnectionAccessToken({ connectionId: otherConnection.connection.id }),
    ).rejects.toBeInstanceOf(UndecryptableSecretError);
  });

  test('never sends an access token stored in the refresh token column to the provider', async () => {
    const { userId } = await seedAuthenticatedUser();
    const { connection, accessToken } = await seedGmailConnection({ userId });
    await db
      .update(integrationConnection)
      .set({ refreshToken: connection.accessToken })
      .where(sql`${integrationConnection.id} = ${connection.id}`);
    await expireConnectionAccessToken({ connectionId: connection.id });

    await expect(getConnectionAccessToken({ connectionId: connection.id })).rejects.toBeInstanceOf(
      UndecryptableSecretError,
    );
    const sentRefreshTokens = providerHttp.tokenRequests.map((request) =>
      request.form.get('refresh_token'),
    );
    expect(sentRefreshTokens).not.toContain(accessToken);
  });
});
