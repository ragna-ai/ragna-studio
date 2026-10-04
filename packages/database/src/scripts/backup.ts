// Dumps the Postgres database to a timestamped .sql file under backups/ at
// the repo root. Runs pg_dump *inside* the running postgres container
// (docker exec) rather than on the host, so the dump tool version always
// matches the server without requiring postgres-client tools locally.
//
// Usage: pnpm --filter @repo/database db:backup [containerName]
// Restore: psql "$DATABASE_URL" < backups/<file>.sql

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '@repo/config';

const DEFAULT_CONTAINER = 'ragna_studio_postgresql';

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

function timestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

async function main(): Promise<void> {
  const container = process.argv[2] ?? DEFAULT_CONTAINER;

  const url = new URL(config.getSecret('DATABASE_URL'));
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));

  const backupsDir = resolve(findRepoRoot(process.cwd()), 'backups');
  await mkdir(backupsDir, { recursive: true });
  const outputFile = resolve(backupsDir, `${database}-${timestamp()}.sql`);

  console.log(`Dumping "${database}" from container "${container}" to ${outputFile} ...`);

  await new Promise<void>((resolvePromise, reject) => {
    const dump = spawn(
      'docker',
      ['exec', '-e', `PGPASSWORD=${password}`, container, 'pg_dump', '-U', user, '-d', database, '--no-owner', '--clean', '--if-exists'],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );

    const out = createWriteStream(outputFile);
    dump.stdout.pipe(out);

    dump.on('error', reject);
    dump.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump exited with code ${code}`));
        return;
      }
      resolvePromise();
    });
  });

  console.log(`Backup written to ${outputFile}`);
}

main().catch((error) => {
  console.error('Backup failed:', error);
  process.exit(1);
});
