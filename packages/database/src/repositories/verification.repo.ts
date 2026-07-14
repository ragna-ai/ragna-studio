import { lt } from 'drizzle-orm';
import { db } from '../db';
import { verification } from '../schema';

// better-auth never sweeps verification rows (email/OTP tokens) once they
// expire, so they accumulate indefinitely. This sweeper deletes them
// directly. Returns the number of rows deleted, for logging.
export async function deleteExpiredVerifications(): Promise<number> {
  const deletedVerifications = await db
    .delete(verification)
    .where(lt(verification.expiresAt, new Date()))
    .returning({ id: verification.id });

  return deletedVerifications.length;
}
