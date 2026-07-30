# API tests

Integration tests for `apps/api`, per `docs/testing/strategy.md`. Tests call
`app.request()` in-process (no port, no server boot) against a real,
dedicated Postgres database (`studio_test`) and the real docker Redis.

## Layout

Tests are grouped by domain folder, one folder per feature area:

- `test/credit/` — the credit system (balance/usage routes, the
  `assertCanSpend` gate, and the repo's charge math and settlement logic).
- `test/user/` — user routes.
- `test/smoke/` — cross-cutting harness tests: the health check and the DB
  safety guard (`db-safety.test.ts`), not tied to any one feature.
- `test/support/` — app-local test plumbing (the bun preload script), not
  test files.
- `test/scripts/` — one-off scripts (`test:setup`), not test files.

bun discovers `*.test.ts` recursively, so a new domain gets its own folder
with no config changes. Add new feature areas as their own top-level folder
under `test/`, following this pattern.

## One-time setup (per fresh docker volume)

Creates `studio_test` if it doesn't exist yet and pushes the current drizzle
schema into it:

```bash
pnpm --filter @repo/api test:setup
```

Re-run this after schema changes (it's a plain `drizzle-kit push --force`,
safe to run repeatedly).

## Running the tests

```bash
pnpm --filter @repo/api test
# or, from apps/api:
bun test
```

## How isolation works

- `bunfig.toml` preloads `test/support/preload.ts`, which sets
  `DB_DATABASE=studio_test` before any test file (or the app) imports
  `@repo/config`. `@repo/config` loads the root `.env` via dotenv, and
  dotenv never overwrites a variable that's already set, so this override
  wins.
- `bunfig.toml` also sets `maxConcurrency = 1`. bun test's default (20)
  schedules tests from different files concurrently, but every file's
  `beforeEach` truncates the whole database (see below) against one shared
  `@repo/database` connection: two files running at once means one file's
  truncate can wipe rows a different file's in-flight request still needs,
  surfacing as flaky foreign-key violations rather than a clean assertion
  failure. `docs/testing/strategy.md`'s "truncate between tests" isolation
  model assumes serial execution; `maxConcurrency = 1` is what actually
  makes that true, not just a performance knob.
- The db truncate/guard and auth-seed helpers all live in `@repo/testing`
  (`packages/testing`), a private, build-free package: its `exports` point
  straight at `src/`, so both `bun test` here and Playwright later (Phase 2
  of `docs/testing/strategy.md`) can import it without a build step.
  - `getConnectedDatabaseName()` / `assertConnectedToTestDatabase()`
    (`packages/testing/src/db/db-guard.ts`): every mutating helper calls the
    assertion first. `test/smoke/db-safety.test.ts` asserts the same thing
    at the app level, so a broken preload fails loudly instead of quietly
    truncating the dev database.
  - `truncateAllTables()` (`packages/testing/src/db/truncate.ts`): truncates
    every `public` schema table (`RESTART IDENTITY CASCADE`) between tests.
    Call it in a `beforeEach`.
  - `seedAuthenticatedUser()` (`packages/testing/src/auth/auth-seed.ts`)
    seeds a user, a personal workspace, and a signed session cookie for
    tests that hit authenticated routes. It uses better-auth's own
    `testUtils` plugin, registered on the real `auth` instance
    (`packages/auth/src/server/auth.ts`) only when `config.isTest` is true,
    so the cookie it mints verifies against the real `authMiddleware`, and
    seeded users go through the same `databaseHooks.user.create.after` a
    real signup would (workspace creation). See the doc comment in
    `auth-seed.ts` for details, including why the personal workspace is
    fetched rather than created a second time.

## Production code touched

Two small, test-gated additions, both required for `auth-seed.ts`:

- `packages/config/src/services/config.service.ts`: added a `get isTest()`
  getter (`NODE_ENV === 'test'`).
- `packages/auth/src/server/auth.ts`: registers better-auth's `testUtils()`
  plugin only when `config.isTest` is true. It adds no HTTP routes; the
  plugin's only effect is exposing `ctx.test` on `auth.$context`.

Plus one always-on re-export, `export { sql } from 'drizzle-orm';` in
`packages/database/src/index.ts`, so test helpers never need their own
`drizzle-orm` dependency (a second copy at a different version would build
query fragments against the wrong instance).

After editing `@repo/config` or `@repo/auth`, rebuild before running tests
(`@repo/testing` itself has no build step: it exports TS source directly):

```bash
pnpm --filter @repo/config build
pnpm --filter @repo/auth build
```
