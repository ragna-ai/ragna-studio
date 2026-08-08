# Testing Strategy

Status: in-progress. Agreed 2026-07-29. Phase 1 (API integration tests) is actively being built. Phase 2 (Playwright e2e) is future work.

## Phases

1. **Phase 1 (now):** API integration tests for `apps/api`.
2. **Phase 2 (later):** Playwright e2e for `apps/web`, reusing the Phase 1 seed helpers.

## Phase 1: API integration tests

### Runner: `bun test`

The API runs on Bun (`bun --watch src/index.ts`). Using `bun test` avoids a
runtime mismatch, needs zero config, and is fast. Tests live in
`apps/api/test/` and run via `pnpm --filter @repo/api test`. A `test` task is
registered in `turbo.json`.

Layout: tests are grouped by domain folder, one folder per feature area.
`test/credit/` for everything credit-related, `test/user/` for user routes,
and so on. Cross-cutting harness tests (health check, DB safety guard) live
in `test/smoke/`. bun discovers `*.test.ts` recursively, so new folders need
no config. The one-off DB setup script lives in `@repo/testing`
(`packages/testing/scripts/setup-test-db.ts`), not in `apps/api`, since it's
db-agnostic and every consuming app runs the same `test:setup` command.

### Style: route-level through `app.request()`

`apps/api/src/app.ts` exports the Hono app separately from `Bun.serve`. Tests
call `app.request()` in-process: real request in, real JSON out. No port, no
server boot, no HTTP client.

This exercises controllers, zod validation, services, and the DB together.
That matches the thin-controller architecture: logic lives in services, so
testing controllers in isolation has little value. Pure unit tests are
reserved for genuinely tricky logic (credit math, markup BPS rounding,
pagination cursors).

### Database: real Postgres, dedicated test database

The docker Postgres on `localhost:5437` gets a second database, `studio_test`.
Schema is pushed with drizzle (`db:push` with overridden env). Mocking Drizzle
is a maintenance tarpit and silently misses relation and constraint bugs.

Env override mechanics: `@repo/config` is a singleton that loads the root
`.env.testing` (test DB name, credits flags) ahead of `.env` via dotenv
whenever `NODE_ENV=test`, since dotenv processes paths in order and never
overwrites a var already set by an earlier one. Bun sets `NODE_ENV=test`
automatically for every `bun test` run, before any module imports
`@repo/config`, so the test profile wins with no extra wiring. The one-off
`test:setup` script (not run via `bun test`) sets `NODE_ENV=test` explicitly
in its `package.json` invocation instead.

### Isolation: truncate between tests

`TRUNCATE ... RESTART IDENTITY CASCADE` over all app tables in a shared
`beforeEach` helper. Transaction-per-test is awkward when handlers open their
own connections. Truncation is dumb, reliable, and fast enough at this scale.

This model requires strictly serial test execution: one test's truncate must
never overlap another test's in-flight queries. `maxConcurrency = 1` in
`apps/api/bunfig.toml` enforces that (bun's default of 20 interleaves tests
across files and caused flaky FK violations). The same rule applies across
processes: never run two `bun test` invocations against `studio_test` at
once. If the suite ever gets slow enough that serial execution hurts,
the fix is per-worker databases, not turning concurrency back on.

### Auth: better-auth `testUtils` plugin, real middleware

better-auth is configured with social providers only (no email/password), so
tests cannot sign up through the API. better-auth 1.6 ships a `testUtils`
plugin (`better-auth/plugins`) that exposes `ctx.test` helpers:
`createUser()`, `saveUser()`, `getAuthHeaders()`, `getCookies()`. The plugin
is added to the auth config only when running tests (gated on env), never in
production builds. It registers no HTTP routes.

A thin seed helper wraps these: create and save a user, ensure the personal
workspace exists (helper-created seeds may bypass the signup `databaseHooks`
that normally create it), and return the session cookie header. Requests
attach that cookie and the real auth middleware runs.

### Shared helpers: `@repo/testing`

All reusable helpers (auth seeding, truncate, DB guard, external-provider
mocks, and later queue assertions) live in a dedicated private package,
`packages/testing`. Seeding uses the production auth instance's `ctx.test`
(the gated plugin), so seeded users run the real signup `databaseHooks`,
including personal-workspace creation. Reason: Phase 2 Playwright in
`apps/web` reuses the same seed helpers and cannot import from
`apps/api/test/`. The package also owns the test-only deps (`better-auth`),
so apps only take a single `@repo/testing` devDependency.

Unlike other `@repo/*` packages it has no tsdown build and exports TS source
directly. Only test runners consume it (bun test, later Playwright) and both
execute TS natively, so there is no dist to rebuild after helper edits.
App-specific bits stay local to each app: just the test files themselves,
which register the external-provider mocks by importing `@repo/testing`
before anything that transitively imports the real packages.

This matters because authorization bugs (cross-workspace access) are exactly
what API tests should catch. The same helper becomes the seam Playwright
reuses in Phase 2.

### External boundaries

- **Redis / BullMQ:** real docker Redis on `localhost:6381`. The API mostly
  enqueues; asserting "job landed in queue X with DTO Y" is cheap and real.
- **AI providers, R2 storage, LinkedIn:** faked with Bun's `mock.module()`,
  registered in `packages/testing/src/mocks/` and detailed in
  `apps/api/test/README.md`'s "External-provider mocks" section. Not
  literally `@repo/ai` at the package boundary as originally planned here:
  it's bundled by tsdown, so mocking it wouldn't reach a call from one of
  its own functions to another. The `ai` npm package underneath it is
  mocked instead (an external, unbundled import even after `@repo/ai` is
  built), which has the added benefit of keeping `@repo/ai`'s own real
  orchestration — including DB persistence — under test, not faked away.
  `@repo/storage` and `@repo/linkedin` are mocked at the package boundary as
  originally planned, since apps/api imports them directly and they're thin
  wrappers with no internal logic worth preserving. `@repo/mail` turned out
  to need no mock: nothing in `apps/api/src` imports it directly.

### Priorities

1. **Credit system.** Money code with a recent review
   (`docs/credits/review-2026-07-29.md`). Tests lock in the fixes.
2. **Authorization across workspace-scoped resources.** The container model
   (`docs/api-standards/prd.md`) makes these checks systematic.
3. **Plain CRUD** (tasks, folders, datasets) as cheap wins.
4. **Deferred:** streaming chat and WebSockets. Different tooling, worst
   effort-to-value ratio right now.

Worker processors (`apps/worker`) are out of scope for Phase 1, but queue
assertion helpers are written so worker tests can reuse them later.

## Phase 2: e2e (later)

Playwright against `apps/web` with api and worker running for real. Kept
thin: a handful of critical journeys (login, create workspace, chat
round-trip, kanban flow), not a re-test of every endpoint. The API layer
covers correctness; e2e proves the wiring.

Google OAuth cannot be automated. Playwright's global setup seeds a user and
session via the Phase 1 helpers and injects the cookie instead of clicking
through OAuth.
