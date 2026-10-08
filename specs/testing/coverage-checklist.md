# API test coverage checklist

Status: snapshot 2026-07-30. Feature-level view of `apps/api` test coverage,
companion to `specs/testing/strategy.md`. Update this file as domains move
between sections; it's a checklist, not a log, so edit in place rather than
appending.

## Covered

- [x] **auth** — `authMiddleware` (session), `workspaceGuard`, route-sweep
- [x] **workspace** — CRUD + guard
- [x] **credit** — balance/usage, charge math
- [x] **user** — profile
- [x] **folder** — CRUD + document cascade
- [x] **task** / **task-label** — CRUD, business rules, move
- [x] **dataset** / **dataset-row** — CRUD, export, reorder
- [x] **agent** — CRUD + `/memory` (GET/PUT)
- [x] **notification** — list/unread-count/read/read-all/delete
- [x] **overview** — aggregated `GET /workspace/:workspaceId/overview` read
- [x] **aimodel** — the single `GET /aimodel` route
- [x] **chat** (metadata only) — list/create/get/rename/delete. Sending a
      message is WS-only, still deferred (see below)
- [x] **workflow** (metadata + run listing) — CRUD, publish, run
      history/cancel, and `creditGuard` (402 with no credits, passes through
      once funded). Actual run execution is a worker concern, out of scope
- [x] **imagegen** — list, create (real DB persistence, faked `ai`-package
      provider call), reference-upload (faked R2 upload), capability gating
- [x] **videogen** — list, create, frame-upload. No AI-provider mock needed:
      `POST /` only inserts a pending row and enqueues a real BullMQ job,
      the actual provider call happens in `apps/worker`'s processor
- [x] **social-post** — CRUD (no mock needed) + `/publish` (faked
      `@repo/linkedin` client, including a proven failure-path override)
- [x] **agent-context-document** — upload/list/rename/retry/delete (faked
      R2 upload)

External-provider mocks (`ai`-package `generateImage`, `@repo/storage`,
`@repo/linkedin`, via Bun's `mock.module()`) live in
`packages/testing/src/mocks/`, documented in full in
`apps/api/test/README.md`'s "External-provider mocks" section.

`@repo/mail` was in the original "External boundaries" list
(`specs/testing/strategy.md`) but turned out not to need a mock: nothing in
`apps/api/src` imports it directly (email only goes out via a BullMQ job
`apps/worker` processes), so there's no `apps/api` route to mock it for.
Relevant if `apps/worker` gets its own test suite later.

## Deferred (strategy doc, priority 4)

- [ ] **chat streaming / WS** (`ws.controller.ts`) — different tooling,
      worst effort-to-value ratio right now.

## Suggested order

Every domain from the original checklist is now covered except the
deferred one above. Next candidates, in rough order of value:

1. Chat streaming / WebSockets (Phase 2 territory — may fold into
   Playwright e2e against the real running app instead of an `apps/api`
   `mock.module()`-based unit test, since a live socket is hard to fake
   convincingly at that boundary).
2. `apps/worker` processor tests, now that `packages/testing/src/mocks/`
   is built to be reused there (`ai-provider.mock.ts`'s `generateImage` fake
   plus the not-yet-built `experimental_generateVideo` one, `@repo/storage`'s
   `extractDocumentText` path) — a natural "Phase 1.5" the strategy doc
   didn't originally scope.
3. Phase 2: Playwright e2e for `apps/web` (see `specs/testing/strategy.md`).
