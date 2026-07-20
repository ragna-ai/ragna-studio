import { config } from '@repo/config';
import { createWorkspace, db } from '@repo/database';
import * as schema from '@repo/database/schema';
import { queue, WELCOME_EMAIL_JOB, WelcomeEmailJobDto } from '@repo/queue';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';

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
  plugins: [admin()],
  baseURL: config.apiBaseUrl.replace(/\/$/, ''),
  basePath: '/auth',
  trustedOrigins: [...config.trustedOrigins, config.appUrl, 'https://appleid.apple.com'],
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema,
  }),
  // session: { cookieCache: { enabled: true } },
  socialProviders: {
    google: {
      clientId: config.googleClientId,
      clientSecret: config.getSecret('GOOGLE_CLIENT_SECRET'),
    },
    microsoft: {
      clientId: config.microsoftClientId,
      clientSecret: config.getSecret('MICROSOFT_CLIENT_SECRET'),
      tenantId: config.microsoftTenantId,
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
  user: {},
  account: {
    accountLinking: {
      enabled: true,
      // The LinkedIn email may differ from the user's sign-in email, so we
      // can't require a match to link the account.
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
      // TODO: check ip-conf for cf & reverse proxy
      // ipAddressHeaders: ['cf-connecting-ip'], // or any other custom header
    },
    cookiePrefix: 'app',
  },
  // EXPERIMENTAL
  // experimental: { joins: true },
  // TELEMETRY
  telemetry: {
    enabled: false,
  },
}) as unknown as ReturnType<typeof betterAuth>;
