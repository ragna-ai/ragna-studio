import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { ConfigService } from './services/config.service';

// Walk up from cwd to the monorepo root, marked by pnpm-workspace.yaml. turbo/pnpm
// always launch each app's dev script with cwd set to that app's own directory, so
// this is stable regardless of where pnpm physically places this package's files
// (e.g. injected as a real copy under node_modules/.pnpm instead of symlinked in place).
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (!existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Could not locate monorepo root (no pnpm-workspace.yaml found)');
    }
    dir = parent;
  }
  return dir;
}

// In production, env vars are injected by the container runtime — skip .env loading.
if (process.env.NODE_ENV !== 'production') {
  const rootDir = findRepoRoot(process.cwd());

  // dotenv never overwrites a var already set by an earlier path, so
  // .env.testing wins over .env when NODE_ENV=test.
  const envFiles = process.env.NODE_ENV === 'test' ? ['.env.testing', '.env'] : ['.env'];

  dotenvConfig({ path: envFiles.map((file) => resolve(rootDir, file)) });
}

export const config = new ConfigService();
