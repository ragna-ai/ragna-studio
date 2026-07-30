import { db, sql } from '@repo/database';

// Keep in sync with DB_DATABASE in the root .env.testing (loaded by
// @repo/config whenever NODE_ENV=test).
const TEST_DATABASE_NAME = 'studio_test';

export interface ConnectedDatabaseName {
  name: string;
}

export async function getConnectedDatabaseName(): Promise<ConnectedDatabaseName> {
  const result = await db.execute(sql`select current_database() as name`);
  const [row] = result.rows as { name: string }[];

  if (!row) {
    throw new Error('Could not determine the connected database name.');
  }

  return { name: row.name };
}

/**
 * Every helper that mutates rows across the whole schema (truncate, seeding)
 * calls this first. Without it, an env misconfiguration would silently
 * point tests at the dev database, and a truncate-between-tests strategy
 * would wipe real data.
 */
export async function assertConnectedToTestDatabase(): Promise<void> {
  const { name } = await getConnectedDatabaseName();

  if (name !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to continue: expected the "${TEST_DATABASE_NAME}" database but connected to "${name}". ` +
        'Check that NODE_ENV=test is set before any other import (Bun sets this automatically for `bun test`).',
    );
  }
}
