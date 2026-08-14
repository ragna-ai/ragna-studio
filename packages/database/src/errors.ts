// file: errors.ts

import { DrizzleQueryError } from 'drizzle-orm';

// Postgres' unique_violation code.
const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';

/**
 * True if `error` is a unique-constraint violation surfaced through
 * drizzle. node-postgres throws a `DatabaseError` with `code: '23505'`;
 * drizzle wraps every driver error in `DrizzleQueryError` and attaches the
 * original as `.cause` rather than re-exposing `code` on the wrapper
 * itself, so a plain `'code' in error` check on the caught error never
 * matches.
 *
 * Exported here (instead of callers importing `drizzle-orm` and doing their
 * own `instanceof DrizzleQueryError` check) so that check always runs
 * against the same `DrizzleQueryError` class this package's own `db`
 * instance throws with. A second copy of `drizzle-orm` resolved into a
 * caller's own dependency tree would be a different class reference and
 * `instanceof` would silently never match - the same hazard the `sql`
 * re-export in index.ts guards against.
 */
export function isUniqueViolationError(error: unknown): boolean {
  if (!(error instanceof DrizzleQueryError)) {
    return false;
  }

  const cause = error.cause;
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return false;
  }

  return cause.code === POSTGRES_UNIQUE_VIOLATION_CODE;
}
