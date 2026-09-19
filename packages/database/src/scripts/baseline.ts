// Records every migration in ./drizzle as already applied, without running
// its SQL. Needed exactly once per database that already has the current
// schema from `db:push` (this project's local dev workflow) but has never
// gone through the `migrate` service: drizzle-orm's own tracking table is
// empty there, so a real `migrate` run would try to recreate tables/enums
// that already exist and fail with "already exists" errors.
//
// Uses drizzle-orm's own readMigrationFiles() so the recorded hash/name
// match exactly what a real migrate() run would compute, then writes to its
// tracking table using the same schema migrate() itself creates.
import { Client } from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { config } from '@repo/config';

const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE = '__drizzle_migrations';
const MIGRATION_LOCK_KEY = 8_902_113;

async function main(): Promise<void> {
  const client = new Client({
    connectionString: config.getSecret('DATABASE_URL'),
    ssl: config.dbSSL ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  const db = drizzle({ client });
  const schemaIdentifier = sql.identifier(MIGRATIONS_SCHEMA);
  const tableIdentifier = sql.identifier(MIGRATIONS_TABLE);

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${schemaIdentifier}`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ${schemaIdentifier}.${tableIdentifier} (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint,
        name text,
        applied_at timestamp with time zone DEFAULT now()
      )
    `);

    const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
    for (const migration of migrations) {
      const { rows: existing } = await db.execute<{ name: string }>(sql`
        SELECT name FROM ${schemaIdentifier}.${tableIdentifier} WHERE name = ${migration.name}
      `);
      if (existing.length > 0) {
        console.log(`Already baselined: ${migration.name}`);
        continue;
      }

      await db.execute(sql`
        INSERT INTO ${schemaIdentifier}.${tableIdentifier} ("hash", "created_at", "name")
        VALUES (${migration.hash}, ${migration.folderMillis}, ${migration.name})
      `);
      console.log(`Baselined: ${migration.name}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    await client.end();
  }
}

main().catch((error) => {
  console.error('Baseline failed:', error);
  process.exit(1);
});
