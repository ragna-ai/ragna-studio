import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import { ConfigService } from './services/config.service';

// In production, env vars are injected by the container runtime — skip .env loading.
if (process.env.NODE_ENV !== 'production') {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');

  // dotenv never overwrites a var already set by an earlier path, so
  // .env.testing wins over .env when NODE_ENV=test.
  const envFiles = process.env.NODE_ENV === 'test' ? ['.env.testing', '.env'] : ['.env'];

  dotenvConfig({ path: envFiles.map((file) => resolve(rootDir, file)) });
}

export const config = new ConfigService();
