import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import { ConfigService } from './services/config.service';

// In production, env vars are injected by the container runtime — skip .env loading.
if (process.env.NODE_ENV !== 'production') {
  dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
}

export const config = new ConfigService();
