// Applies pending SQL migrations from ./drizzle against DATABASE_URL. This
// is what runs on every deploy (see the `migrate` service in
// docker-compose.yml) so a fresh Postgres ends up with the full schema
// without anyone needing drizzle-kit or the TS source installed.
//
// Guarded by a Postgres advisory lock: drizzle-orm's migrate() has no
// locking of its own (drizzle-team/drizzle-orm#874), so two containers
// starting at once (e.g. a redeploy overlapping the outgoing one) could
// otherwise race the same migration in twice. The lock is session-scoped,
// so it's taken and released on the same Client, not the pooled `db` export.
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '@repo/config';

const MIGRATION_LOCK_KEY = 8_902_113;

async function main(): Promise<void> {
  const client = new Client({
    connectionString: config.getSecret('DATABASE_URL'),
    ssl: config.dbSSL ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    console.log('Waiting for migration lock...');
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    console.log('Running migrations...');
    await migrate(drizzle({ client }), { migrationsFolder: './drizzle' });
    console.log('Migrations complete.');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
