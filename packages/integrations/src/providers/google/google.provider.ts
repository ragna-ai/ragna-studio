import { config } from '@repo/config';
import * as z from 'zod';
import { createOAuthProvider, fetchProfileJson } from '../../oauth/oauth-client';

const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const profileSchema = z.object({
  sub: z.string(),
  email: z.string().nullish(),
  name: z.string().nullish(),
});

export const googleProvider = createOAuthProvider(() => ({
  isConfigured: () => config.googleClientId.length > 0,
  issuer: 'https://accounts.google.com',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  clientId: config.googleClientId,
  clientSecret: config.getSecret('GOOGLE_CLIENT_SECRET'),
  usePkce: true,
  identityScopes: ['openid', 'email', 'profile'],
  extraAuthorizeParams: {
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  },
  async getProfile(accessToken) {
    const profile = profileSchema.parse(await fetchProfileJson(USERINFO_URL, accessToken));

    return { id: profile.sub, email: profile.email ?? null, name: profile.name ?? null };
  },
}));
