import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { config } from '@repo/config';
import { createWorkspace, db } from '@repo/database';
import * as schema from '@repo/database/schema';
import { queue, WELCOME_EMAIL_JOB, WelcomeEmailJobDto } from '@repo/queue';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, jwt, lastLoginMethod, testUtils } from 'better-auth/plugins';

// Real permissions come from mcp_settings (docs/mcp/prd.md P1); offline_access
// is only here because OAuth Provider gates refresh-token issuance on it.
const MCP_SCOPES = ['mcp', 'offline_access'] as const;

// LinkedIn requires these scopes for sign-in (openid/profile/email) and
// posting on the user's behalf (w_member_social). Used unless an operator
// overrides them via the LINKEDIN_SCOPES env var.
const DEFAULT_LINKEDIN_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

// import { importPKCS8, SignJWT } from 'jose';
// async function generateAppleClientSecret() {
//   const privateKey = await importPKCS8(config.getSecret('APPLE_PRIVATE_KEY'), 'ES256');
//   const now = Math.floor(Date.now() / 1000);
//   return new SignJWT({})
//     .setProtectedHeader({ alg: 'ES256', kid: config.appleKeyId })
//     .setIssuer(config.appleTeamId)
//     .setSubject(config.appleClientId)
//     .setAudience('https://appleid.apple.com')
//     .setIssuedAt(now)
//     .setExpirationTime(now + 180 * 24 * 60 * 60)
//     .sign(privateKey);
// }

export const auth = betterAuth({
  // testUtils has no HTTP routes; it only adds ctx.test, the seam
  // packages/testing/src/auth/auth-seed.ts uses to mint session cookies for
  // integration tests (better-auth has no email/password provider, so
  // tests can't sign up through the API). Gated on NODE_ENV so it's absent
  // in dev and production.
  plugins: [
    admin(),
    lastLoginMethod(),
    ...(config.isTest ? [testUtils()] : []),
    ...(config.mcpEnabled
      ? [
          jwt(),
          mcp({
            loginPage: `${config.appUrl}/auth/login`,
            consentPage: `${config.appUrl}/oauth/consent`,
            resource: config.mcpResourceUrl,
            scopes: [...MCP_SCOPES],
            accessTokenExpiresIn: config.mcpAccessTokenTtlSeconds,
            refreshTokenExpiresIn: config.mcpRefreshTokenTtlSeconds,
            allowDynamicClientRegistration: false,
          }),
          cimd({
            fetchClientMetadataResource,
            metadataProfile: 'mcp-2026-07-28',
            isMetadataDocumentUrlAllowed: (clientIdUrl) =>
              config.mcpAllowedClientIds.includes(clientIdUrl),
          }),
        ]
      : []),
  ],
  baseURL: config.apiBaseUrl.replace(/\/$/, ''),
  basePath: '/auth',
  trustedOrigins: [...config.trustedOrigins, config.appUrl, 'https://appleid.apple.com'],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    transaction: true,
  }),
  // session: { cookieCache: { enabled: true } },
  socialProviders: {
    google: {
      clientId: config.googleClientId,
      clientSecret: config.getSecret('GOOGLE_CLIENT_SECRET'),
      // Google only issues a refresh token on a consenting grant. Needed so
      // the Gmail account-linking flow (linkSocial() with gmail.modify,
      // apps/web) gets a refresh token to store, even though the base
      // sign-in scopes stay plain openid/profile/email (docs/email/prd.md,
      // "Auth and account connection").
      accessType: 'offline',
      prompt: 'consent',
    },
    microsoft: {
      clientId: config.microsoftClientId,
      clientSecret: config.getSecret('MICROSOFT_CLIENT_SECRET'),
      tenantId: config.microsoftTenantId,
      // Entra sends no email_verified; xms_edov (optional ID-token claim in the app registration) is Microsoft's nOAuth-safe signal.
      mapProfileToUser: (profile) => ({ emailVerified: profile.xms_edov === true }),
    },
    linkedin: {
      clientId: config.linkedInClientId,
      clientSecret: config.getSecret('LINKEDIN_CLIENT_SECRET'),
      disableDefaultScope: true,
      scope: config.linkedInScopes.length > 0 ? config.linkedInScopes : DEFAULT_LINKEDIN_SCOPES,
    },
    // apple: async () => ({
    //   clientId: config.appleClientId,
    //   clientSecret: await generateAppleClientSecret(),
    // }),
  },
  // MIDDLEWARE
  hooks: {},
  user: {
    // Runs on every sign-up, account link, and OAuth sign-in (with the fresh
    // provider email each time), so removing an email from the allowlist
    // locks out an already-registered user on their next login too.
    // Only registered with an allowlist: better-auth requires an endpoint context for it.
    validateUserInfo:
      config.allowedLoginEmails.length > 0
        ? ({ user }) => {
            if (config.allowedLoginEmails.includes(user.email?.toLowerCase() ?? '')) return;
            return {
              error: 'email_not_allowed',
              errorDescription: 'This email is not permitted to sign in.',
            };
          }
        : undefined,
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      allowDifferentEmails: true,
    },
  },
  // DATABASE
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Every user needs a workspace to create anything in (WP0 of
          // docs/api-standards/prd.md: workspaceId is a required container).
          await createWorkspace({ ownerId: user.id, name: 'Personal' });

          // Integration tests seed users through this same hook (see
          // packages/testing/src/auth/auth-seed.ts), which would otherwise
          // flood the real Redis-backed email queue on every test run.
          if (config.isTest) return;

          await queue.email().add(
            WELCOME_EMAIL_JOB,
            WelcomeEmailJobDto.fromJSON({
              email: user.email,
              name: user.name,
            }),
          );
        },
      },
    },
  },
  // ADVANCED
  advanced: {
    database: {
      generateId: false,
    },
    ipAddress: {
      // Cloudflare sits in front of Traefik and always sets this to the
      // single real client IP, so we don't need to parse/trust the
      // x-forwarded-for chain through Traefik.
      ipAddressHeaders: ['cf-connecting-ip'],
    },
    cookiePrefix: 'app',
    // Needed so cookies are visible across app.* and api.* subdomains in prod.
    ...(config.cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: config.cookieDomain } }
      : {}),
  },
  // EXPERIMENTAL
  // experimental: { joins: true },
  // TELEMETRY
  telemetry: {
    enabled: false,
  },
}) as unknown as ReturnType<typeof betterAuth>;
