import { db, sql } from '@repo/database';
import { assertConnectedToTestDatabase } from '../db/db-guard';

/**
 * Backdates every session row for a user so the next `authMiddleware` check
 * against it fails as expired, without needing better-auth's `testUtils` to
 * expose an "expire this session" helper (it doesn't). Raw SQL against the
 * `sessions` table (packages/database/src/schema/session.schema.ts) rather
 * than a repo function: this is test-only backdoor state, not something
 * production code should ever do.
 */
export async function expireSession({ userId }: { userId: string }): Promise<void> {
  await assertConnectedToTestDatabase();

  await db.execute(
    sql`update sessions set expires_at = now() - interval '1 day' where user_id = ${userId}`,
  );
}
