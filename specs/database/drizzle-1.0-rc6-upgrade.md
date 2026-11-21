# Drizzle 1.0.0-rc.5 → rc.6 upgrade assessment

Status: decided (2026-11-21). Trial green, install after 2026-11-23 19:32 UTC.

## Verdict

**Yes, upgrade. Low risk.** No breaking change hits a code path we use. The gains are date decoding fixes, array `null` fixes and a pool-client leak fix in `node-postgres`.

Earliest install date: **2026-11-23 19:32 UTC**. npm published rc.6 at 2026-11-20 19:31 UTC, and `minimumReleaseAge` is 3 days. Renovate ignores `drizzle-orm`/`drizzle-kit` (`.github/renovate.json5`), so this is a manual PR.

Release notes: https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-rc.6

## Our surface

- Driver: `drizzle-orm/node-postgres` (`pg`), built in `packages/database/src/db.ts` with `relations`.
- Also used: `drizzle-orm/pg-core`, `drizzle-orm/relations`, `drizzle-orm/zod`, the shared migrator, `drizzle-kit` with `dialect: 'postgresql'`.
- Not used: `postgres-js`, `bun-sql`, the new `drizzle-orm/postgres` driver, query cache, Effect drivers.

## Breaking changes checked against the code

| Change                                                                                                             | Effect on us                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raw `db.execute` results follow the driver's own parsers                                                           | Production calls ignore the result: `email-message.repo.ts` (bulk `UPDATE ... FROM (VALUES ...)`) and the advisory lock in `integration-connection.repo.ts`. Tests and `baseline.ts` read rows; `pnpm test:api` covers them.                                                                                                   |
| Cast codecs removed; per-query text decoding for temporal types                                                    | Our `sql<number>` fields return types `pg` reads as numbers: `count(*)::int` and `max(task.number)` (`task.repo.ts`), `length()` and the cosine distance (`agent-context-document-chunk.repo.ts`). The `sql<Date>` fields in `chat.repo.ts` and `agent-template.repo.ts` feed an `INSERT ... SELECT`, so nothing decodes them. |
| Subquery selected as a field is typed `\| null`                                                                    | We don't select subqueries as fields. No type fallout expected.                                                                                                                                                                                                                                                                |
| Non-positive `limit`/`offset` no longer dropped                                                                    | API validation sets `limit` `min(1)`. `offset(0)` is now emitted, which is harmless.                                                                                                                                                                                                                                           |
| ESM only, `engines.node` `^20.19.0 \|\| >=22.12.0`                                                                 | `@repo/database` is `"type": "module"`. We run Bun and Node 26.                                                                                                                                                                                                                                                                |
| `not()` no longer returns `SQL \| undefined` for `SQLWrapper`                                                      | Only a type narrowing. The `media.repo.ts` workaround from rc.5 keeps compiling.                                                                                                                                                                                                                                               |
| Query cache, `.concurrently()`, `up-migrations`, `withCastCodecs`, dialect `concat`/`substring` removed or changed | No usage.                                                                                                                                                                                                                                                                                                                      |
| `postgres-js`, `bun-sql`, MySQL, SQLite, MSSQL, Cockroach, Effect changes                                          | Not our driver or dialect.                                                                                                                                                                                                                                                                                                     |

## drizzle-kit

The Postgres snapshot format moves from 9 to 10 (`concurrently` dropped from index entries). Expect `generate` to ask for `drizzle-kit up` again, as with rc.5. Run `up`, check that every `migration.sql` is unchanged, then `generate` must say "No schema changes".

## Fixes we gain

- `pg` `date`/`timestamp` in `date` mode: years 1 to 99, years past 9999 and `BC` values decode correctly. Non-ISO `DateStyle` now throws instead of returning wrong dates.
- `null` elements of array columns stay `null`. `jsonb` array elements are written as SQL `null`, not JSON `null`.
- `node-postgres` transactions no longer return the client to the pool after a failed `BEGIN` ([#6622](https://github.com/drizzle-team/drizzle-orm/issues/6622)).
- `json`/`jsonb` params with `Date` or `Buffer` values no longer fail on `node-postgres`.
- Query builders no longer drop `offset(0)` ([#6599](https://github.com/drizzle-team/drizzle-orm/issues/6599)). `$dynamic()` typing fixes.
- Kit: faster `push`/`pull` introspection and Postgres diffing.

## Not in this upgrade

`drizzle-orm/postgres` (drizzle's own driver with `bulkInsert`, `bulkUpdate`, pipelining) and `drizzle-orm/postgres/cdc` with `drizzle-pulse` (row changes streamed from the WAL). Pulse could serve WebSocket push (#368). It needs a driver switch and `wal_level = logical`, so it gets its own issue.

## Trial

Trial in a worktree off `chore/drizzle-rc6`. Both packages were bumped to `1.0.0-rc.6`, and the cooldown was bypassed with a temporary `minimumReleaseAgeExclude` (removed again).

| Check                                         | Result                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm install`                                | OK. After `pnpm update -r drizzle-kit drizzle-orm`: only rc.6 of both. See the lockfile note.      |
| `pnpm build`                                  | OK, 23/23 tasks.                                                                                   |
| `pnpm check-types`                            | OK, 22/22, with no code changes.                                                                   |
| `drizzle-kit generate` on the existing folder | Refuses: "snapshot.json is not of the latest version, please run drizzle-kit up".                  |
| `drizzle-kit up`                              | Rewrites all 36 `snapshot.json` files. Every `migration.sql` is byte-identical (empty `git diff`). |
| `drizzle-kit generate` after `up`             | "No schema changes, nothing to migrate".                                                           |
| `pnpm test:api`                               | 1404 pass, 0 fail. A first run with a stale kit in the lockfile gave 44 fail (lockfile note).      |
| `pnpm test:worker`                            | 204 pass, 0 fail.                                                                                  |
| `migrate()` on a fresh scratch DB             | Not run: `psql` is not installed. `test:setup` only pushes the schema, so no migration SQL ran.    |

Lockfile note: a plain `pnpm install` keeps a second `drizzle-kit@1.0.0-rc.5` in the lockfile. It is the auto-installed optional peer of `better-auth`. That gives `better-auth` two peer variants, so pnpm can no longer link `@repo/auth`, `@repo/config` and `@repo/storage` straight to the workspace folders. It injects frozen copies instead. The test mocks and `spyOn(config)` then hit a different module instance than the app, and 44 API tests failed (S3 `NoSuchBucket`, logger and config overrides ignored). Run `pnpm update -r drizzle-kit drizzle-orm` after the bump. It drops the rc.5 kit, restores the links and turns every test green. No code change is needed.

## Required code changes

None. The raw `db.execute` calls in `packages/testing` and the `| null` subquery typing compile unchanged.

## Upgrade steps

1. After 2026-11-23 19:32 UTC: bump both packages to `1.0.0-rc.6` in `packages/database/package.json`, then `pnpm install` and `pnpm update -r drizzle-kit drizzle-orm`. `pnpm why drizzle-kit` must show only rc.6.
2. `pnpm exec drizzle-kit up` in `packages/database`. Commit the snapshot rewrite.
3. `pnpm --filter @repo/database build`, `pnpm --filter @repo/testing build`, then `pnpm check-types`, `pnpm test:api`, `pnpm test:worker`.
4. `pnpm --filter @repo/database db:generate` must report no schema changes.
5. Deploy as usual. The `migrate` service runs rc.6 `migrate()` on an already-migrated database.
