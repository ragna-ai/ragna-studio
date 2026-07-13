import { config } from '@repo/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: config.getSecret('DATABASE_URL'),
    ssl: config.dbSSL ? { rejectUnauthorized: false } : undefined,
  },
});
