#!/usr/bin/env bun
// One-time (per fresh docker volume) setup for the API test suite:
//   1. create the `studio_test` database if it doesn't exist yet
//   2. push the current drizzle schema into it
//
// Usage: pnpm --filter @repo/api test:setup
// (see apps/api/test/README.md)
import { $, SQL } from 'bun';

// Must happen before importing @repo/config: dotenv (inside @repo/config)
// never overwrites a variable that's already set, so this is what makes the
// composed DATABASE_URL point at studio_test instead of the dev database.
// Same trick as test/support/preload.ts, which does this for `bun test`.
process.env.DB_DATABASE = 'studio_test';

const { config } = await import('@repo/config');

const testDatabaseUrl = new URL(config.getSecret('DATABASE_URL'));
const testDatabaseName = testDatabaseUrl.pathname.replace(/^\//, '');

// An explicit DATABASE_URL in .env takes precedence over the DB_DATABASE
// override above, so without this check the --force push below could hit
// the dev database.
if (testDatabaseName !== 'studio_test') {
  throw new Error(`Refusing to run against "${testDatabaseName}", expected studio_test.`);
}

async function createDatabaseIfMissing(): Promise<void> {
  // `postgres` is docker Postgres's own always-present maintenance
  // database. It's needed because you can't connect to a database to create it.
  const adminDatabaseUrl = new URL(testDatabaseUrl);
  adminDatabaseUrl.pathname = '/postgres';

  const adminDb = new SQL(adminDatabaseUrl.toString());
  try {
    const existing = await adminDb`select 1 from pg_database where datname = ${testDatabaseName}`;
    if (existing.length > 0) {
      console.log(`Database "${testDatabaseName}" already exists.`);
      return;
    }

    console.log(`Creating database "${testDatabaseName}"...`);
    await adminDb.unsafe(`create database ${testDatabaseName}`);
  } finally {
    await adminDb.close();
  }
}

async function pushSchema(): Promise<void> {
  console.log(`Pushing drizzle schema into "${testDatabaseName}"...`);
  // pnpm runs drizzle-kit with packages/database as cwd, so its
  // drizzle.config.ts reads the inherited DB_DATABASE=studio_test via
  // @repo/config the same way the app does. --force auto-approves
  // data-loss prompts, which is safe only because of the studio_test
  // assertion above.
  await $`pnpm --filter @repo/database exec drizzle-kit push --force`;
}

await createDatabaseIfMissing();
await pushSchema();

console.log('Test database ready.');
