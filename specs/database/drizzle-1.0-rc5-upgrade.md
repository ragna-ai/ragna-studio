# Drizzle 1.0.0-rc.4 → rc.5 upgrade assessment

Status: implemented (2026-10-28). Assessed by a trial upgrade first.

## Verdict

**Yes, upgrade.** The trial needed 4 small code fixes and one `drizzle-kit up` run. After that, every check was green. rc.5 also fixes a class of tenant-scope bugs ([#5636](https://github.com/drizzle-team/drizzle-orm/issues/5636)) that matters for us. That alone is worth the move.

Earliest install date: **2026-10-24 18:00 UTC**. npm published rc.5 at 2026-10-21 17:59 UTC, and `minimumReleaseAge` is 3 days. Renovate ignores `drizzle-orm`/`drizzle-kit` (`.github/renovate.json5`), so this is a manual PR.

## What was run (ground truth)

Trial in a throwaway git worktree off `058e954e`. Both packages were bumped to `1.0.0-rc.5`, and the cooldown was bypassed with a temporary `minimumReleaseAgeExclude`.

| Check                                           | Result                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm install`                                  | OK. Lockfile resolves only `drizzle-orm@1.0.0-rc.5` (better-auth, db0 included).       |
| `pnpm build`                                    | OK, 20/20 tasks.                                                                       |
| `pnpm check-types` before fixes                 | 3 errors (see below).                                                                  |
| `pnpm check-types` after fixes                  | OK, 19/19.                                                                             |
| `pnpm test:api` before the `task.repo` fix      | 876 pass, 7 fail. All 7 are the `undefined` filter in `listTasks`.                     |
| `pnpm test:api` after fixes                     | 883 pass, 0 fail.                                                                      |
| `pnpm test:worker`                              | 150 pass, 0 fail.                                                                      |
| `drizzle-kit generate` on the existing folder   | Refuses: "snapshot.json is not of the latest version, please run drizzle-kit up".      |
| `drizzle-kit up`                                | Rewrites all 17 `snapshot.json`. Every `migration.sql` is byte-identical.              |
| `drizzle-kit generate` after `up`               | "No schema changes". A probe column produced a correct one-line `ALTER TABLE`.         |
| `migrate()`: rc.4-migrated DB, then rc.5 on top | No-op. 17 rows in `drizzle.__drizzle_migrations`, same table columns before and after. |
| `migrate()`: fresh DB with rc.5                 | 17 applied. Column, index and constraint hashes identical to the rc.4-built DB.        |
| `packageExtensions` pin removed                 | Install OK, kit links rc.5, `generate` works. The workaround is no longer needed.      |

Not tested: the rc.4 migrator reading the converted snapshots (rollback case). The runtime migrator reads only `migration.sql`, so this should be fine. Also not tested: the web app in a browser.

## Required code changes

### 1. `undefined` in relational `where` now throws

rc.5 throws `Unexpected 'undefined' in filter value` instead of silently dropping the key. The types still accept `undefined`, so `tsc` does not catch this. Only runtime does.

The one hit is `listTasks` in `packages/database/src/repositories/task.repo.ts`: optional `status` and `priority`. It breaks `GET /workspace/:id/task` without filters (a 500). Fix:

```ts
import { EmptyFilter } from 'drizzle-orm/relations';
// ...
status: status ?? EmptyFilter,
priority: priority ?? EmptyFilter,
```

To prove there are no other hits, a TypeScript-compiler script walked all 97 `db.query.*.findMany/findFirst` calls in `@repo/database` (plus `@repo/testing`). It flagged every `where` property whose static type includes `undefined`. Against rc.4 main, it flags exactly these two `task.repo.ts` lines. With the fix, it flags nothing real (two conditional spreads in `dataset.repo.ts` are type-union noise). Values that are `undefined` at runtime despite a non-optional type (casts, `!`) can't be found statically. Those now fail loudly instead of widening the query.

**Why this matters:** in rc.4, `where: { id, workspaceId }` with `workspaceId` `undefined` turns into "any workspace" ([#5636](https://github.com/drizzle-team/drizzle-orm/issues/5636)). That is the exact scope bug our resource guard exists to prevent.

### 2. `not()` returns `SQL | undefined`

`mediaVisibleToUser` in `media.repo.ts` returns `SQL`, so `return not(...)` no longer type-checks. The trial used `?? sql\`true\``. A cleaner fix is a choice for the implementation PR.

### 3. Raw `db.execute()` result types

An untyped `db.execute(sql)` now returns a union of every driver response shape (`NodePgRawExecuteResult`), which has no `.rows`. Fix: pass the row type, which also removes the existing `as` casts.

- `packages/testing/src/db/db-guard.ts`: `db.execute<{ name: string }>(...)`
- `packages/testing/src/db/truncate.ts`: `db.execute<{ tablename: string }>(...)`

`chat.repo.ts` and `baseline.ts` already pass a type parameter and compile unchanged.

### 4. Config cleanup

- Remove the `packageExtensions.drizzle-kit` block from `pnpm-workspace.yaml`. rc.5 kit declares `drizzle-orm` as a peer. (Its comment about a hoisted 0.45.2 is already stale. No 0.45 is left in the lockfile.)
- Update the "also pinned in packageExtensions" comment in `.github/renovate.json5`.

## Migration folder: `drizzle-kit up`

rc.5 kit stores one base snapshot plus structured diffs, so it can check whether migrations from different branches commute. Run once, from `packages/database`:

```bash
pnpm exec drizzle-kit up
```

This rewrites all `drizzle/*/snapshot.json` (about 197k lines removed, 15k added) and leaves every `migration.sql` alone. Commit it in the same PR as the version bump. Any branch that generated a migration with rc.4 must rebase and re-run `up` before its next `generate`.

## Breaking changes that don't affect us

Checked against the code. None apply:

- `postgres-js` parser and JSON double-stringify fix: we use `node-postgres`.
- `withReplicas`, query cache, `withCache`, `DBQueryConfigWithComment`, `getTableUniqueName`, `View` export moves, `getSQL`/`toSQL` cast codecs, `relationsFilterToSQL`: no usage.
- Empty relation filters (`{ posts: {} }`) are now skipped: no such filters.
- New RQBv2 query strategy for Postgres ([#5245](https://github.com/drizzle-team/drizzle-orm/issues/5245)): this only breaks raw SQL that references relation aliases. Our `RAW`/`orderBy` callbacks use only the table's own columns. The test suite confirms it.
- `DrizzleQueryError` no longer carries `params`: `errors.ts` reads only `cause`. Fewer user values in logs is a plus.
- SQLite, MySQL, MSSQL, Cockroach, `bytea` and `sqlite-proxy` changes: not our dialect or types.

## Fixes we gain

- `node-postgres` transactions no longer leak a pool client when `BEGIN` fails ([#6341](https://github.com/drizzle-team/drizzle-orm/issues/6341)). They also no longer crash the process when the connection drops mid-transaction ([#6437](https://github.com/drizzle-team/drizzle-orm/issues/6437)). We have about 21 `transaction()` call sites.
- `$onUpdate` no longer runs when the column is set explicitly ([#5780](https://github.com/drizzle-team/drizzle-orm/issues/5780)). This affects `updatedAt` in `common.schema.ts`.
- Batch insert no longer hits a `RangeError` at about 120k params ([#5994](https://github.com/drizzle-team/drizzle-orm/issues/5994)).
- Kit: `DROP COLUMN` before `DROP INDEX` ordering fix ([#6045](https://github.com/drizzle-team/drizzle-orm/issues/6045)), and fewer false default-value diffs ([#5569](https://github.com/drizzle-team/drizzle-orm/issues/5569)).
- RQBv2 `orderBy` on relations (`{ posts: 'asc(count)' }`). Not needed now, but it could replace some hand-written aggregates.

## Upgrade steps

1. After 2026-10-24 18:00 UTC: bump both packages to `1.0.0-rc.5` in `packages/database/package.json`, then `pnpm install`.
2. Apply code changes 1 to 4 above.
3. `pnpm exec drizzle-kit up` in `packages/database`. Commit the snapshot rewrite.
4. `pnpm --filter @repo/database build`, `pnpm --filter @repo/testing build`, then `pnpm check-types`, `pnpm test:api`, `pnpm test:worker`.
5. Deploy as usual. The `migrate` service runs rc.5 `migrate()`, which the trial showed is a no-op on an already-migrated database.
