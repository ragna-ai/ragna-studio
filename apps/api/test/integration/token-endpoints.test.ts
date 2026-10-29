import {
  ConnectionNeedsReauthError,
  getConnectionAccessToken,
  type IntegrationId,
  type ProviderId,
} from '@repo/integrations';
import {
  expireConnectionAccessToken,
  providerHttp,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedLinkedinConnection,
  setProviderProfile,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { callOauthCallback, listConnections, startConnect } from './support/connect-flow';

interface ProviderCase {
  provider: ProviderId;
  integrationId: IntegrationId;
  usesPkce: boolean;
  returnsRefreshToken: boolean;
}

const PROVIDER_CASES: ProviderCase[] = [
  {
    provider: 'google',
    integrationId: 'gmail',
    usesPkce: true,
    returnsRefreshToken: true,
  },
  {
    provider: 'microsoft',
    integrationId: 'outlook-mail',
    usesPkce: true,
    returnsRefreshToken: true,
  },
  {
    provider: 'linkedin',
    integrationId: 'linkedin-posting',
    usesPkce: false,
    returnsRefreshToken: false,
  },
];

describe('provider token endpoints', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test.each(PROVIDER_CASES)(
    'exchanges the authorization code for $provider and reads the granted scopes',
    async (scenario) => {
      const { cookieHeader } = await seedAuthenticatedUser({ email: 'anna@example.com' });
      setProviderProfile(scenario.provider, {
        id: `${scenario.provider}-sub`,
        email: 'anna@example.com',
        name: 'Anna',
      });
      const { state } = await startConnect({ cookieHeader, integrationId: scenario.integrationId });

      await callOauthCallback({ cookieHeader, query: { code: 'code-1', state } });

      const [request] = providerHttp.tokenRequests;
      expect(request?.form.get('grant_type')).toBe('authorization_code');
      expect(request?.form.get('code')).toBe('code-1');
      expect(request?.form.get('client_id')).toStartWith('test-');
      expect(request?.form.get('client_secret')).toStartWith('test-');
      expect(request?.form.has('code_verifier')).toBe(scenario.usesPkce);
      const [connection] = await listConnections(cookieHeader);
      expect(connection?.integrations).toEqual([scenario.integrationId]);
      expect(connection?.status).toBe('active');
    },
  );

  test.each(PROVIDER_CASES)(
    'refreshes an expired $provider token with the stored refresh token',
    async (scenario) => {
      const { cookieHeader } = await seedAuthenticatedUser({ email: 'anna@example.com' });
      setProviderProfile(scenario.provider, {
        id: `${scenario.provider}-sub`,
        email: 'anna@example.com',
        name: 'Anna',
      });
      const { state } = await startConnect({ cookieHeader, integrationId: scenario.integrationId });
      await callOauthCallback({ cookieHeader, query: { code: 'code-1', state } });
      const [connection] = await listConnections(cookieHeader);
      if (!connection) throw new Error('missing connection');
      await expireConnectionAccessToken({ connectionId: connection.id });
      providerHttp.tokenRequests.length = 0;

      const token = getConnectionAccessToken({ connectionId: connection.id });

      if (!scenario.returnsRefreshToken) {
        await expect(token).rejects.toBeInstanceOf(ConnectionNeedsReauthError);
        expect(providerHttp.tokenRequests).toHaveLength(0);
        return;
      }
      expect(await token).toBe('refreshed-access-token');
      const [request] = providerHttp.tokenRequests;
      expect(request?.form.get('grant_type')).toBe('refresh_token');
      expect(request?.form.get('refresh_token')).toBe(`granted-refresh-token-${scenario.provider}`);
      expect(request?.form.get('client_secret')).toStartWith('test-');
    },
  );

  test('refreshes a LinkedIn token whose response has no token type', async () => {
    const { userId } = await seedAuthenticatedUser();
    const { connection } = await seedLinkedinConnection({ userId });
    await expireConnectionAccessToken({ connectionId: connection.id });

    const token = await getConnectionAccessToken({ connectionId: connection.id });

    expect(token).toBe('refreshed-access-token');
  });
});
