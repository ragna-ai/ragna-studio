// packages/testing/src/db/setup-test-db.ts
//
// Setup for the `studio_test` database:
// drops and recreates it (so schema changes that rename constraints never
// hit drizzle-kit's interactive prompts), then pushes the current drizzle
// schema into the fresh database. `pushSchema` below runs drizzle-kit against packages/database's
// own drizzle.config.ts, so this works the same for every consuming app.
// Run via `pnpm --filter @repo/testing test:setup` (see scripts/
// setup-test-db.ts, which sets NODE_ENV=test before importing this).
import { config } from '@repo/config';
import { $, SQL } from 'bun';

const TEST_DATABASE_NAME = 'studio_test';

export async function setupTestDatabase(): Promise<void> {
  const testDatabaseUrl = new URL(config.getSecret('DATABASE_URL'));
  const testDatabaseName = testDatabaseUrl.pathname.replace(/^\//, '');

  // An explicit DATABASE_URL in .env takes precedence over the
  // DB_DATABASE override the caller is expected to have set, so without
  // this check the --force push below could hit the dev database.
  if (testDatabaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to run against "${testDatabaseName}", expected ${TEST_DATABASE_NAME}.`,
    );
  }

  await recreateDatabase(testDatabaseUrl, testDatabaseName);
  await ensureExtensions(testDatabaseUrl);
  await pushSchema(testDatabaseName);

  console.log('Test database ready.');
}

async function recreateDatabase(testDatabaseUrl: URL, testDatabaseName: string): Promise<void> {
  // `postgres` is docker Postgres's own always-present maintenance
  // database. It's needed because you can't connect to a database to drop or
  // create it.
  const adminDatabaseUrl = new URL(testDatabaseUrl);
  adminDatabaseUrl.pathname = '/postgres';

  const adminDb = new SQL(adminDatabaseUrl.toString());
  try {
    console.log(`Recreating database "${testDatabaseName}"...`);
    await adminDb.unsafe(`drop database if exists ${testDatabaseName} with (force)`);
    await adminDb.unsafe(`create database ${testDatabaseName}`);
  } finally {
    await adminDb.close();
  }
}

async function ensureExtensions(testDatabaseUrl: URL): Promise<void> {
  // docker/postgres-init.sql only creates these for the default database at
  // container init, not for studio_test, which is created later above.
  const testDb = new SQL(testDatabaseUrl.toString());
  try {
    await testDb.unsafe('create extension if not exists vector');
    await testDb.unsafe('create extension if not exists pg_trgm');
  } finally {
    await testDb.close();
  }
}

async function pushSchema(testDatabaseName: string): Promise<void> {
  console.log(`Pushing drizzle schema into "${testDatabaseName}"...`);
  // pnpm runs drizzle-kit with packages/database as cwd, so its
  // drizzle.config.ts reads the inherited DB_DATABASE=studio_test via
  // @repo/config the same way the app does. --force auto-approves
  // data-loss prompts, which is safe only because of the studio_test
  // assertion above.
  await $`pnpm --filter @repo/database exec drizzle-kit push --force`;
}
