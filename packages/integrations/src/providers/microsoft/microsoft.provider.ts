import { config } from '@repo/config';
import * as z from 'zod';
import { createOAuthProvider, fetchProfileJson } from '../../oauth/oauth-client';

const GRAPH_ME_URL =
  'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName';

const profileSchema = z.object({
  id: z.string(),
  displayName: z.string().nullish(),
  mail: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
});

export const microsoftProvider = createOAuthProvider(() => {
  const tenantBase = `https://login.microsoftonline.com/${config.microsoftTenantId}`;

  return {
    isConfigured: () => config.microsoftClientId.length > 0,
    issuer: `${tenantBase}/v2.0`,
    authorizationEndpoint: `${tenantBase}/oauth2/v2.0/authorize`,
    tokenEndpoint: `${tenantBase}/oauth2/v2.0/token`,
    clientId: config.microsoftClientId,
    clientSecret: config.getSecret('MICROSOFT_CLIENT_SECRET'),
    usePkce: true,
    identityScopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read'],
    extraAuthorizeParams: { response_mode: 'query', prompt: 'select_account' },
    async getProfile(accessToken) {
      const profile = profileSchema.parse(await fetchProfileJson(GRAPH_ME_URL, accessToken));

      return {
        id: profile.id,
        email: profile.mail ?? profile.userPrincipalName ?? null,
        name: profile.displayName ?? null,
      };
    },
  };
});
