import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

// Fractional-indexing sort keys (dataset rows, tasks) are compared
// byte-for-byte by the `fractional-indexing` library, and every "insert
// between these two neighbors" computation in this codebase assumes that
// same byte order. Postgres's default locale collation (e.g. `en_US.utf8`)
// sorts letters differently: `'Zz' < 'a0'` is true in byte order but false
// under `en_US.utf8` (verified: uppercase-headed keys, which
// `fractional-indexing` uses to represent values before the default start
// key, sort *after* lowercase-headed ones under that locale). A plain
// `asc(column)`/`desc(column)` on a `sortOrder` column can therefore return
// rows in an order that disagrees with the keys' actual meaning, corrupting
// both display order and the "neighbor" lookups used to compute a moved
// row's new key (symptom: a row's key cycles between a few values instead
// of converging toward the end being moved to). `COLLATE "C"` forces byte
// order so the DB's ordering matches the library's. See
// specs/database/fractional-indexing-collation.md for the full writeup.

/**
 * Orders `column` ascending by raw byte value (`COLLATE "C"`), not
 * Postgres's default locale collation. Drop-in replacement for drizzle's
 * `asc()` wherever `column` holds a fractional-indexing (or otherwise
 * byte-order-compared) key.
 */
export function byteOrderAsc(column: AnyColumn): SQL {
  return sql`${column} COLLATE "C" ASC`;
}

/**
 * Orders `column` descending by raw byte value (`COLLATE "C"`), not
 * Postgres's default locale collation. Drop-in replacement for drizzle's
 * `desc()` wherever `column` holds a fractional-indexing (or otherwise
 * byte-order-compared) key.
 */
export function byteOrderDesc(column: AnyColumn): SQL {
  return sql`${column} COLLATE "C" DESC`;
}
