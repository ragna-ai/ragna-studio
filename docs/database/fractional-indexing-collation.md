# Fractional-indexing `sortOrder` columns need byte-order comparison

_Fixed: 2026-08-07._

## Symptom

Reordering dataset rows (`datasetRow.sortOrder`) or Kanban tasks (`task.sortOrder`) misbehaved in several ways:

- Moving a row/task step by step toward one end of the list would stall, "shuffle", or snap back to a stale position.
- Moving a row/task from one end all the way to the other would flip back to the original end partway through, or cycle between a small set of keys (e.g. `Zz → a10V → a0V → Zz → ...`) instead of converging.
- Some rows/tasks threw `Error: a >= b` from `fractional-indexing`'s `midpoint()` and could not be moved at all.

## Root cause

`sortOrder` columns store [`fractional-indexing`](https://www.npmjs.com/package/fractional-indexing) keys (alphabet `0-9A-Za-z`). The library compares keys with plain byte/ASCII order everywhere: uppercase-headed keys (e.g. `Zz`) represent values *before* the default start key `a0`, lowercase-headed keys represent values after it. `generateKeyBetween(a, b)` and every "insert this row between these two neighbors" computation in `dataset.repo.ts` / `task.repo.ts` assumes that same byte order.

Postgres's default locale collation (this DB was initialized with `en_US.utf8`, confirmed via `SELECT datcollate FROM pg_database`) does **not** sort that way:

```sql
SELECT 'Zz' < 'a0'                       AS default_collation_lt,  -- false
       'Zz' COLLATE "C" < 'a0' COLLATE "C" AS c_collation_lt;      -- true
```

So `ORDER BY sort_order` returned rows in an order that disagreed with what the keys actually mean. Every "who's my neighbor" lookup (`moveDatasetRow`, `moveTask`, `getDatasetRows`, `listTasks`, `sortOrderAtBottomOfColumn`, ...) was therefore working off the wrong adjacency, which explains all three symptoms above — including the exact `a >= b` crash, which requires two adjacent rows in the (wrongly-ordered) query result to have the *same* key: pre-existing duplicate `sortOrder` values (from backfilled data) sort as truly adjacent under `C` collation but can end up separated or reordered under the locale collation, and vice versa.

Drizzle-kit's `db:push`/`db:pull` workflow (see root `CLAUDE.md`) doesn't version raw migrations, and `drizzle-orm@1.0.0-rc.4`'s pg-core column builders have no `.collate()` method (only `mysql-core` has one) — so there's no schema-level way to pin the column's collation and have it survive a push.

## Fix

Force byte order at the query level instead of the column level: `packages/database/src/utils/sort-order.ts` exports `byteOrderAsc(column)` / `byteOrderDesc(column)`, thin `sql` wrappers that append `COLLATE "C"` to the ordering expression. Every query in `dataset.repo.ts` and `task.repo.ts` that orders by a `sortOrder` column (including relational-query `orderBy` callbacks, which accept raw `SQL` per `DBQueryConfigOrderByCallback`) uses these instead of `asc()`/`desc()`.

`moveDatasetRow` and `moveTask` also self-heal pre-existing duplicate `sortOrder` values in place (see the `hasDuplicateSortOrder` check in each file) before computing a move, since historical data can still contain them regardless of collation.

**If a new table/query adds a fractional-indexing `sortOrder` (or similar lexicographically-compared) column**, use `byteOrderAsc`/`byteOrderDesc` for every `ORDER BY` on it, not `asc()`/`desc()` — otherwise the same class of bug reappears.

## Performance note

`COLLATE "C"` isn't only more correct here, it's also cheaper: `C`/`POSIX` comparisons are plain byte `memcmp`, while a locale collation (`en_US.utf8`) goes through a locale-aware `strcoll`/ICU call on every comparison. That's a per-comparison win regardless of indexing.

The bigger win, an index that satisfies the `ORDER BY` outright (no separate sort step), needs an index whose collation matches the query's — but neither `dataset_rows` nor `tasks` currently has *any* index on `sort_order` (only `datasetId`/`workspaceId`/`userId` are indexed; see `dataset.schema.ts`/`task.schema.ts`). Every `sortOrder` query today does a sequential scan + in-memory sort regardless of collation. At current caps (`MAX_ROWS_PER_DATASET = 1000`, and `listTasks` is deliberately unpaginated on the assumption that a workspace's task count stays board-sized) that's not a real cost, so no index has been added. If row/task counts grow enough for this to matter, add a `COLLATE "C"` expression index (e.g. `(dataset_id, sort_order)` / `(workspace_id, status, sort_order)`) at that point.

## Other columns checked

Audited 2026-08-07: `sort_order` is the only lexicographically-order-dependent text column in the schema. Also found: `gen_images.sort_order` (`genimage.schema.ts`) and `social_post_media.sort_order` (`social-post.schema.ts`) are `integer`, not `text` — numeric comparison, no collation involved, not affected. No materialized-path, cursor-pagination, or other byte-order-dependent text columns exist elsewhere in the schema. `generateKeyBetween`/`fractional-indexing` is only ever imported in `dataset.repo.ts` and `task.repo.ts` (a third hit in `credit.repo.ts` is just a comment referencing this file, not a real usage).
