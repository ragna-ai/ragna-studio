# API tests

Integration tests for `apps/api`, per `specs/testing/strategy.md`. Tests call
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
  and task-label CRUD. `task-workspace-references.test.ts` covers the
  workspace-scoped `assignedAgentId`/`labelIds` references.
- `test/document/` — documents. Today only the workspace-scoped `folderId`
  reference (API and `createDocument` tool).
- `test/database/` — `@repo/database` helpers that need a real database error.
- `test/dataset/` — dataset CRUD, export, and row CRUD/reorder (soft delete,
  pagination, `afterRowId` ordering).
- `test/agent/` — agent CRUD, the `/memory` GET/PUT endpoints, and the
  workspace-scoped `defaultDatasetId` reference.
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
- `test/imagegen/` — image generation CRUD. Like videogen below, the AI
  provider call happens only in `apps/worker`'s gen-images processor, never
  synchronously in an `apps/api` request (`POST /` inserts a batch of
  pending rows and enqueues a real BullMQ job, specs/imagegen/
  worker-execution-prd.md), so completed/failed rows are seeded directly via
  the repo for the tests that need one. This domain needs the storage mock
  (for `reference-upload`) but not the AI one; `generateImageMock` is still
  asserted un-called in the `POST /` tests, to prove generation was really
  deferred to the worker.
- `test/videogen/` — video generation CRUD. The AI provider call happens
  only in `apps/worker`'s processor, never synchronously in an `apps/api`
  request (`POST /` just inserts a pending row and enqueues a real BullMQ
  job), so this domain needs the storage mock (for `frame-upload`) but not
  the AI one.
- `test/social-post/` — social post CRUD needs no mock; `/publish` fakes
  `@repo/linkedin`'s client, including a `mockImplementationOnce` override
  proving the failure path (a rejected `createPost`) marks the post
  `failed` rather than leaving it stuck.
- `test/agent-context-document/` — upload/rename/retry/delete for an
  agent's context documents. Every document is created via a real R2
  upload, faked the same way `test/imagegen/`'s reference-upload is.
- `test/mcp/` — the MCP server (specs/mcp/prd.md): `mcp-endpoint.test.ts`
  covers `POST /mcp` (token/audience/session-cookie/disabled/revoked
  rejections, `tools/list` following live settings, a write call rejected
  under `read` access, append/update stamping `written_by = 'mcp'` and
  landing in `mcp_tool_calls`, and workspace isolation),
  `mcp-settings.test.ts` covers the session-authenticated
  `/mcp-settings` REST (C4 in specs/mcp/slices.md). `support/mcp-fixtures.ts`
  seeds an `oauthClient` row directly (normally CIMD-owned) and mints access
  tokens via the jwt() plugin's server-only `signJWT`, sidestepping the real
  CIMD/consent/token-exchange dance, which the OAuth dance itself stays
  manual-tested (Claude Desktop) rather than automated here.
  `support/jwks-fetch-bridge.ts` patches `globalThis.fetch` so
  `requireMcpAuth`'s real HTTP fetch to `${baseURL}/jwks` (the one exception
  to this harness's "no port, no server boot" model, which token
  verification requires) resolves via `app.request()` instead of hitting a
  socket. `bunfig.toml` preloads `test/mcp-env.preload.ts` (no imports, sets
  `MCP_ENABLED=true`) ahead of `test/preload.ts`, since `@repo/config` reads
  `process.env` once at first import.
- `test/smoke/` — cross-cutting harness tests: the health check and the DB
  safety guard (`db-safety.test.ts`), not tied to any one feature.

bun discovers `*.test.ts` recursively, so a new domain gets its own folder
with no config changes. Add new feature areas as their own top-level folder
under `test/`, following this pattern.

## One-time setup (per fresh docker volume)

Drops and recreates `studio_test`, then pushes the current drizzle schema into
the fresh database:

```bash
pnpm --filter @repo/api test:setup
```

Re-run this after schema changes (safe to run repeatedly; it wipes the test
database each time, so no other test run may be in progress). This delegates to `pnpm --filter @repo/testing
test:setup` (`packages/testing/scripts/setup-test-db.ts`), which is
db-agnostic (no apps/api-specific paths), so `apps/worker`'s future test
suite can run the exact same command instead of duplicating it.

## Running the tests

```bash
pnpm --filter @repo/api test
# or, from apps/api:
bun test
```

## How isolation works

- Bun sets `NODE_ENV=test` automatically for every `bun test` run, before
  any test file imports `@repo/config`. `@repo/config` responds by loading
  the root `.env.testing` (test DB name, credits flags) ahead of `.env`, via
  dotenv, which never overwrites a variable already set by an earlier file
  in the list.
- `bunfig.toml` also sets `maxConcurrency = 1`. bun test's default (20)
  schedules tests from different files concurrently, but every file's
  `beforeEach` truncates the whole database (see below) against one shared
  `@repo/database` connection: two files running at once means one file's
  truncate can wipe rows a different file's in-flight request still needs,
  surfacing as flaky foreign-key violations rather than a clean assertion
  failure. `specs/testing/strategy.md`'s "truncate between tests" isolation
  model assumes serial execution; `maxConcurrency = 1` is what actually
  makes that true, not just a performance knob.
- The db truncate/guard and auth-seed helpers all live in `@repo/testing`
  (`packages/testing`), a private, build-free package: its `exports` point
  straight at `src/`, so both `bun test` here and Playwright later (Phase 2
  of `specs/testing/strategy.md`) can import it without a build step.
  - `getConnectedDatabaseName()` / `assertConnectedToTestDatabase()`
    (`packages/testing/src/db/db-guard.ts`): every mutating helper calls the
    assertion first. `test/smoke/db-safety.test.ts` asserts the same thing
    at the app level, so a broken env setup fails loudly instead of quietly
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

## External-provider mocks

`specs/testing/strategy.md`'s "External boundaries" (AI providers, R2
storage, LinkedIn, Redis/BullMQ) are faked with Bun's `mock.module()`,
registered by `packages/testing/src/mocks/` (`ai-provider.mock.ts`,
`storage-provider.mock.ts`, `linkedin-provider.mock.ts`,
`queue-provider.mock.ts`, combined by `provider-mocks.ts`). Registration
happens in two places:

- `test/preload.ts`, wired via `bunfig.toml`'s `[test].preload`,
  re-registers the `@repo/linkedin` and `@repo/queue` mocks from apps/api's
  own resolution context. This is required: with
  `injectWorkspacePackages: true`, `@repo/testing` can be materialized as a
  frozen copy under `node_modules/.pnpm/`, and a `mock.module(...)` call
  made inside that copy keys on a different resolved path than the one
  apps/api's code (and, for `@repo/queue`, `@repo/ai`'s bundled dist, which
  imports it as an external specifier) imports, so the mock would silently
  never apply. See `specs/docker-deploy/injected-workspace-packages.md`.
- `@repo/testing`'s module body still runs every `mock.module()` call as a
  side effect: every test file that needs a mock imports it for fixtures
  (`seedAuthenticatedUser`, `truncateAllTables`, ...), listed before its
  own `import { app } from '../../src/app'`, and Bun finishes importing
  every test file before executing any test body. This path covers the
  `ai` and `@repo/storage` mocks, which currently resolve to the same
  virtual-store slot from both contexts. If one of them ever silently
  stops mocking after a lockfile change, re-register it in
  `test/preload.ts` the same way as `@repo/linkedin`/`@repo/queue`.

`test/auth/route-sweep.test.ts` and `test/smoke/health.test.ts` are the
only files that skip the `@repo/testing` import, and neither needs it:
route-sweep asserts a 401 before any controller logic runs, and health
never touches a mocked route.

Each mock spreads the real module and overrides only the network-touching
exports, so everything else the package exports keeps working unmocked:

- **`ai` (the npm package, not `@repo/ai`)** — `generateImage` is faked.
  `@repo/ai` is bundled by tsdown with no `noExternal`, so a call from one
  function to another inside it (e.g. `runGenImages` calling into the same
  package's model factory) is just a local call after bundling, not a
  re-resolved import — mocking `@repo/ai` at the package-specifier level
  would never reach it. Real npm dependencies like `ai` stay external,
  unbundled imports in `@repo/ai`'s dist output, so mocking `ai` itself
  works: Bun's module registry is global, and `@repo/ai`'s dist and the
  test process both resolve `ai` to the same real npm package. Neither
  `test/imagegen/` nor `test/videogen/` exercises this mock today: both
  domains' `POST /` routes only insert pending rows and enqueue a job
  (specs/imagegen/worker-execution-prd.md, specs/videogen/prd.md), the
  provider call itself runs from `apps/worker`'s processors instead. Both
  domains' `POST /` tests assert `generateImageMock` was _not_ called, to
  prove generation was really deferred rather than run inline. It's kept
  registered here so `apps/worker`'s future test suite can reuse the exact
  same fake for its processor-level tests instead of duplicating it.
- **`@repo/storage`** — `uploadObjectBuffer`/`downloadObjectBuffer`/
  `deleteObjects` are faked; pure functions with no I/O (`buildImageUrls`,
  bucket-name helpers, ...) stay real. Unlike `@repo/ai`, apps/api imports
  this directly, so mocking the whole package is the right boundary.
- **`@repo/linkedin`** — `createLinkedinClient` is faked; `LinkedinApiError`
  is spread through real so `instanceof` checks in
  `social-post-media.service.ts` still work against the fake's errors.
- **`@repo/queue`** — the `queue` factory (`queue.workflow()`,
  `queue.genImages()`, ...) and the job-scheduler functions
  (`upsertQueueJobScheduler`/`removeQueueJobScheduler`/
  `getQueueJobSchedulers`) are faked; constants and DTOs stay real via the
  spread. Every apps/api call into `@repo/queue` is fire-and-forget from the
  test's own perspective (enqueue a job, sync a scheduler; nothing here
  reads a job back off a real queue), so there's no reason to touch the
  shared docker Redis the local dev worker also polls from — doing so would
  either pile up unprocessed test jobs there or have the dev worker
  actually try (and fail) to process rows that only exist in `studio_test`.
  As a second line of defense (in case a real-Redis path is ever added),
  `REDIS_DB` in `.env.testing` also points `NODE_ENV=test` runs at a
  separate logical Redis database (`packages/config`'s `redisDb` /
  `packages/queue`'s connection options) from dev's db 0.

Every mock exposes a `reset*ProviderMock()` (combined as
`resetProviderMocks()`), which every test file using a mock calls in
`beforeEach` alongside `truncateAllTables()` — a test that overrides a
mock's behavior with `mockImplementationOnce` (e.g. `test/social-post/`'s
"faked LinkedIn client rejects" case) would otherwise leak that override
into the next test in the file.

Lives in `@repo/testing` rather than app-local so `apps/worker`'s future
test suite can register the same fakes: its gen-video processor calls
`runGenVideo` (`@repo/ai`, hits the same `generateImage`/
`experimental_generateVideo` boundary — only `generateImage` is faked so
far, since no `apps/api` route needs the video one yet), and its
agent-context-document processor calls `extractDocumentText`
(`@repo/storage`).

## Production code touched

- `packages/config/src/index.ts`: loads the root `.env.testing` (committed,
  no secrets — test DB name, credits flags) ahead of `.env` whenever
  `NODE_ENV=test`, since dotenv processes paths in order and never
  overwrites a var an earlier file already set. Replaces an earlier version
  of this harness that instead pre-set `process.env.DB_DATABASE` directly
  in each consuming app's preload script; the `.env.testing` approach
  handles it in one place instead of per-app, and sidesteps an import-
  ordering hazard the old approach had (a static import of anything that
  transitively imports `@repo/config` before the `process.env` assignment
  would silently load the wrong database).
- `packages/config/src/services/config.service.ts`: added a `get isTest()`
  getter (`NODE_ENV === 'test'`), required for `auth-seed.ts`.
- `packages/auth/src/server/auth.ts`: registers better-auth's `testUtils()`
  plugin only when `config.isTest` is true. It adds no HTTP routes; the
  plugin's only effect is exposing `ctx.test` on `auth.$context`.

Plus always-on re-exports:

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
