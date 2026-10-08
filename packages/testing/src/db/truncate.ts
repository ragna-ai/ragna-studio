import { db, sql } from '@repo/database';
import { assertConnectedToTestDatabase } from './db-guard';

export interface TruncateAllTablesResult {
  truncatedTables: string[];
}

/**
 * Wipes every app table between tests (specs/testing/strategy.md,
 * "Isolation: truncate between tests"). Tables are discovered from
 * `pg_tables` rather than hardcoded, so a new schema table is covered
 * automatically. Drizzle's own bookkeeping tables (only present when using
 * `db:generate` + migrate, not the `db:push` flow this repo uses) are
 * excluded defensively.
 *
 * Guards against ever touching the dev database: the truncate can only run
 * once `assertConnectedToTestDatabase` confirms we're on `studio_test`.
 */
export async function truncateAllTables(): Promise<TruncateAllTablesResult> {
  await assertConnectedToTestDatabase();

  const result = await db.execute(sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename not like '%drizzle%'
  `);
  const truncatedTables = (result.rows as { tablename: string }[]).map((row) => row.tablename);

  if (truncatedTables.length === 0) {
    return { truncatedTables };
  }

  const tableIdentifiers = sql.join(
    truncatedTables.map((tableName) => sql.identifier(tableName)),
    sql`, `,
  );

  await db.execute(sql`truncate table ${tableIdentifiers} restart identity cascade`);

  return { truncatedTables };
}
