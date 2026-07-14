import { lt } from 'drizzle-orm';
import { db } from '../db';
import { session } from '../schema';

// better-auth only removes expired sessions lazily on lookup, so rows for
// sessions nobody looks up again accumulate. This sweeper deletes them
// directly. Returns the number of rows deleted, for logging.
export async function deleteExpiredSessions(): Promise<number> {
  const deletedSessions = await db
    .delete(session)
    .where(lt(session.expiresAt, new Date()))
    .returning({ id: session.id });

  return deletedSessions.length;
}
