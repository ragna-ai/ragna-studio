# API tests

Integration tests for `apps/api`, per `docs/testing/strategy.md`. Tests call
`app.request()` in-process (no port, no server boot) against a real,
dedicated Postgres database (`studio_test`) and the real docker Redis.

## Layout

Tests are grouped by domain folder, one folder per feature area:

- `test/auth/` — `authMiddleware` (session verification: missing/forged/
  expired/revoked cookies), tested against a minimal vehicle route rather
  than any one feature's controller. `route-sweep.test.ts` also walks every
  registered route (via `app.routes`) and asserts each one rejects an
  unauthenticated request, so a controller missing `.use(authMiddleware)`
  fails a test instead of shipping. `workspaceGuard` (workspace-scoped
  authorization) is tested in `test/workspace/` instead, grouped with the
  rest of the workspace domain rather than split out by middleware.
- `test/credit/` — the credit system (balance/usage routes, the
  `assertCanSpend` gate, and the repo's charge math and settlement logic).
- `test/user/` — user routes.
- `test/folder/` — folder CRUD, including the "documents move to root, not
  deleted" cascade on folder delete.
- `test/task/` — task CRUD (filters, subtask/reminder business rules, move)
  and task-label CRUD.
- `test/dataset/` — dataset CRUD, export, and row CRUD/reorder (soft delete,
  pagination, `afterRowId` ordering).
- `test/agent/` — agent CRUD and the `/memory` GET/PUT endpoints.
- `test/notification/` — notification list/unread-count/read/read-all/delete.
  User-scoped, not workspace-scoped, and has no `POST` route (notifications
  are created by other flows); fixtures are seeded directly via
  `createNotification` from `@repo/database`.
- `test/overview/` — the aggregated `GET /workspace/:workspaceId/overview`
  read (five capped-at-5 sections plus totals).
- `test/aimodel/` — the single `GET /aimodel` route (models + deduped
  provider list), not workspace-scoped.
- `test/chat/` — chat metadata CRUD only (list/create/rename/delete).
  Sending a message is WebSocket-only and explicitly deferred; every test
  here creates and passes an explicit `agentId` rather than relying on the
  no-`agentId` default-agent fallback, which depends on an `agent_templates`
  seed row the test database doesn't have.
- `test/workflow/` — workflow CRUD, publish, and run listing/cancel, plus
  `creditGuard` (distinct from `workspaceGuard`, mounted only on
  `POST /:workflowId/run`): 402 with no credit account, passes through once
  `seedCreditAccount()` funds one. Actually executing an enqueued run is a
  worker concern, out of scope for `apps/api`'s Phase 1.
- `test/workspace/` — `workspaceGuard` authorization (`workspace-
  authorization.test.ts`) and workspace CRUD (`workspaces.test.ts`). Unlike
  the other CRUD domains, ownership on the CRUD routes is checked by the
  controller itself (`ownerId`, not `workspaceGuard`, since a workspace has
  to exist before it can be guarded), and delete has two extra rules:
  rejecting the user's last workspace, and 404ing a cross-user delete rather
  than silently no-oping (`deleteWorkspaceById` in
  `packages/database/src/repositories/workspace.repo.ts` now `.returning()`s
  so the service can tell "deleted" from "nothing matched").
- `test/smoke/` — cross-cutting harness tests: the health check and the DB
  safety guard (`db-safety.test.ts`), not tied to any one feature.
- `test/utils/` — everything that isn't a test: the bun preload script
  (`preload.ts`) and the one-off DB setup script (`setup-test-db.ts`, run via
  `test:setup`). Kept out of the domain folders above so `test/`'s top level
  reads as "tests, plus one utils folder" rather than a flat mix of feature
  folders and infra scripts.

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

- `bunfig.toml` preloads `test/utils/preload.ts`, which sets
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
  - `deleteSeededUser()` (`packages/testing/src/auth/auth-seed.ts`) and
    `expireSession()` (`packages/testing/src/auth/session-fixtures.ts`)
    invalidate an already-minted cookie two different ways (deleted user,
    cascading to their sessions; backdated `expiresAt`), for
    `test/auth/session.test.ts`'s coverage of session checks that only show
    up once a session has gone stale, not just "cookie missing or forged".

## Production code touched

Two small, test-gated additions, both required for `auth-seed.ts`:

- `packages/config/src/services/config.service.ts`: added a `get isTest()`
  getter (`NODE_ENV === 'test'`).
- `packages/auth/src/server/auth.ts`: registers better-auth's `testUtils()`
  plugin only when `config.isTest` is true. It adds no HTTP routes; the
  plugin's only effect is exposing `ctx.test` on `auth.$context`.

Plus two always-on re-exports:

- `export { sql } from 'drizzle-orm';` in `packages/database/src/index.ts`,
  so test helpers never need their own `drizzle-orm` dependency (a second
  copy at a different version would build query fragments against the wrong
  instance).
- `export type { NewNotification, Notification } from '../schema';` in
  `packages/database/src/repositories/notification.repo.ts`, mirroring the
  `Workspace` re-export in `workspace.repo.ts` — needed so
  `test/notification/notifications.test.ts` can type its `createNotification`
  fixture without reaching into `@repo/database`'s internal schema module.

After editing `@repo/config` or `@repo/auth`, rebuild before running tests
(`@repo/testing` itself has no build step: it exports TS source directly):

```bash
pnpm --filter @repo/config build
pnpm --filter @repo/auth build
```
