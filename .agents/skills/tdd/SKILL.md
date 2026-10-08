---
name: tdd
description: Apply when changing apps/api or a package it reaches (@repo/database, @repo/media, @repo/storage, ...). Test-driven workflow, test conventions and how to run the API test suite. Use for any feature, bug fix or refactor that touches API behavior.
---

All changes to `apps/api` are test-driven. Packages reached through the API are tested through the API, not with separate package tests.

## Loop

1. **Red:** write a failing test for the behavior first. Run it and check it fails **for the expected reason** (the assertion you wrote, not an import error or a missing fixture).
2. **Green:** write the minimum code that makes it pass.
3. **Refactor:** clean up with the tests green.

- **Bug fixes start with a test that reproduces the bug.** No reproduction, no fix. A typecast is not a fix.
- **Prove a guard catches the regression.** When a test exists to stop something coming back (a removed field, a leaked id), break the code once on purpose, watch the test fail, then revert.

## Writing tests

- Test at the HTTP boundary (`app.request()`), grouped by domain folder (`test/chat/`, `test/task/`), not by middleware.
- Assert behavior, not internals.
- **Response schemas are strict.** Parse responses with `z.strictObject` and list every field the API returns, nested objects included. Plain `z.object` silently strips unknown keys, so a leaked or reintroduced field passes unnoticed. Never loosen with `.passthrough()` or `.catchall()`. Applies to every new or touched test.
- Mock only external services (AI providers, storage, mail, LinkedIn) at the package boundary, never our own code. Pure helpers from a mocked package stay real.
- Make tests deterministic: values that come from env (e.g. `MEDIA_URL`) are pinned in `.env.testing`, not read from a developer's `.env`.
- Conventions, fixtures and existing mocks: `apps/api/test/README.md` and `specs/testing/strategy.md`.

## Running tests

- `pnpm --filter @repo/api test [path]`. Narrowest path while iterating (`test/chat`), the whole suite once before handing back.
- Concurrent runs are safe: every run truncates the shared `studio_test` database, so the test preload takes a Postgres advisory lock (`acquireTestSuiteLock` in `@repo/testing`) and parallel runs queue.
- After editing any `packages/*` source, rebuild it before running tests: `pnpm --filter @repo/<pkg> build`. The API resolves injected dist copies; without a rebuild the tests run stale code.
- One-time database setup: `pnpm --filter @repo/api test:setup`.

## Before finishing

- Did every new test go red first, for the right reason?
- Are response schemas strict?
- Full suite green?
