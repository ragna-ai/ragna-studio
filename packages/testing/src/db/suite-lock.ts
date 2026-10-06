import { db } from '@repo/database';

/** Postgres advisory lock key that serializes API test runs on studio_test. */
export const TEST_SUITE_LOCK_KEY = 7_301_202_604;

/**
 * Every run truncates the shared studio_test database, so two concurrent runs
 * (e.g. parallel agents in separate worktrees) would wipe each other's rows.
 * Takes a session-level advisory lock on a dedicated connection and keeps it
 * for the whole process. Postgres releases it when the connection closes,
 * even if the process is killed, so no stale-lock handling is needed.
 */
export async function acquireTestSuiteLock(): Promise<void> {
  const lockSession = await db.$client.connect();

  const attempt = await lockSession.query<{ locked: boolean }>(
    'select pg_try_advisory_lock($1) as locked',
    [TEST_SUITE_LOCK_KEY],
  );

  if (attempt.rows[0]?.locked) {
    return;
  }

  console.log('Waiting for another API test run to finish...');
  await lockSession.query('select pg_advisory_lock($1)', [TEST_SUITE_LOCK_KEY]);
}
