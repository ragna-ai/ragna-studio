import { config } from '@repo/config';
import { db, schema } from '@repo/database';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { importPKCS8, SignJWT } from 'jose';

async function generateAppleClientSecret() {
  const privateKey = await importPKCS8(config.getSecret('APPLE_PRIVATE_KEY'), 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: config.appleKeyId })
    .setIssuer(config.appleTeamId)
    .setSubject(config.appleClientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(privateKey);
}

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
    // apple: async () => ({
    //   clientId: config.appleClientId,
    //   clientSecret: await generateAppleClientSecret(),
    // }),
  },
  // MIDDLEWARE
  hooks: {},
  user: {},
  // DATABASE
  databaseHooks: {},
  // ADVANCED
  advanced: {
    database: {
      generateId: 'uuid',
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
