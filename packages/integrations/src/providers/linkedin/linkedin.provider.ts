import { config } from '@repo/config';
import * as z from 'zod';
import { createOAuthProvider } from '../../oauth/oauth-client';

const profileSchema = z
  .object({
    sub: z.string(),
    email: z.string().nullish(),
    name: z.string().nullish(),
  })
  .transform((profile) => ({
    id: profile.sub,
    email: profile.email ?? null,
    name: profile.name ?? null,
  }));

export const linkedinProvider = createOAuthProvider(() => ({
  isConfigured: () => config.linkedInClientId.length > 0,
  issuer: 'https://www.linkedin.com/oauth',
  authorizationEndpoint: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
  revocationEndpoint: 'https://www.linkedin.com/oauth/v2/revoke',
  clientId: config.linkedInClientId,
  clientSecret: config.getSecret('LINKEDIN_CLIENT_SECRET'),
  usePkce: false,
  identityScopes: ['openid', 'profile', 'email'],
  profileUrl: 'https://api.linkedin.com/v2/userinfo',
  profileSchema,
}));
