import { config } from '@repo/config';
import { db } from '@repo/database';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';

export const auth = betterAuth({
  plugins: [admin()],
  baseURL: config.appUrl,
  trustedOrigins: config.trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
  }),
  socialProviders: {
    google: {
      clientId: config.googleClientId,
      clientSecret: config.getSecret('GOOGLE_CLIENT_SECRET'),
    },
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
