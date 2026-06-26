import { config } from '@repo/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'turso',
  schema: './src/schema',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url: config.getSecret('DATABASE_URL'),
    // ssl: config.dbSSL ? { rejectUnauthorized: false } : undefined,
  },
});
