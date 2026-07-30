# API test coverage checklist

Status: snapshot 2026-07-30. Feature-level view of `apps/api` test coverage,
companion to `docs/testing/strategy.md`. Update this file as domains move
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

## Blocked on mock infrastructure

`docs/testing/strategy.md`'s "External boundaries" section calls for AI
providers, R2 storage, mail, and LinkedIn to be mocked at the package
boundary (`@repo/ai`, `@repo/storage`, `@repo/mail`, `@repo/linkedin`).
None of those mocks exist yet in `@repo/testing`.

- [ ] **imagegen** — `POST /` calls `createGenImages` from `@repo/ai`
      synchronously in-request; `reference-upload` hits `@repo/storage`.
      `GET /` (list) needs no mock and could be tested today.
- [ ] **videogen** — same shape as imagegen (`@repo/ai` + `@repo/storage`).
- [ ] **social-post** — CRUD is a cheap win today; `/publish` hits
      `@repo/linkedin`'s real client and needs a mock.
- [ ] **agent-context-document** — every document is created via a `POST /`
      multipart file upload that goes through `@repo/storage`
      (`uploadAgentContextDocuments`, `apps/api/src/services/agent-context-
      document.service.ts`); there's no metadata-only creation path, so
      list/rename/retry/delete are blocked too, not just the file-replace
      route. (Corrects an earlier note in this file that assumed only
      `PUT /:documentId/file` needed the mock.)

Building the `@repo/ai` mock is the single biggest unlock here: it's what
blocks imagegen, videogen, and (once chat streaming is in scope) chat
sending. Worth its own session rather than bolting one mock on ad hoc for a
single domain.

## Deferred (strategy doc, priority 4)

- [ ] **chat streaming / WS** (`ws.controller.ts`) — different tooling,
      worst effort-to-value ratio right now.

## Suggested order

1. ~~Agent, notification, overview, aimodel, chat-metadata, workflow-metadata
   + `creditGuard`~~ — done 2026-07-30.
2. Build `@repo/ai` / `@repo/storage` / `@repo/linkedin` mocks in
   `@repo/testing`.
3. Imagegen, videogen, social-post, agent-context-document (all of it, not
   just the file-replace route).
4. Chat streaming / WebSockets (Phase 2 territory, may fold into Playwright
   e2e instead of an `apps/api` unit test).
