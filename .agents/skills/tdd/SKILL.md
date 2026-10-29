---
name: tdd
description: Apply when changing apps/api or a package it reaches (@repo/database, @repo/media, @repo/storage, ...). Test-driven workflow, test conventions and how to run the API test suite. Use for any feature, bug fix or refactor that touches API behavior.
---

All changes to `apps/api` are test-driven. Packages reached through the API are tested through the API, not with separate package tests.

## Start from the spec

When the change has a PRD, its acceptance criteria are the test list. Take the criteria the PRD's testing table puts at the API level and write one failing test per criterion: Given becomes the fixture setup, When the request, Then the assertions.

- Name the test after the behavior in words, never the criterion ID or a `specs/` path (clean-code rule 13).
- List the mapping in the PR body, one line per criterion: `US-1.2 → test/workspace/workspaces.test.ts "rejects deleting the last workspace"`.
- A criterion you can't test at the API level goes back to the PRD's testing table (e2e or worker), not silently dropped.

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
- **Neutral names in security-relevant tests.** The repo is public and fixes land before their advisory. Name tests, variables and comments after the input's shape or size, not the threat: `LARGE_BODY_LENGTH`, "a body made of %s is classified in linear time". Never "hostile", "attack", "malicious", "adversarial", "exploit" or "ReDoS".
- Conventions, fixtures and existing mocks: `apps/api/test/README.md` and `specs/testing/strategy.md`.

## Running tests

- `pnpm --filter @repo/api test [path]`. Narrowest path while iterating (`test/chat`), the whole suite once before handing back.
- Concurrent runs are safe: every run truncates the shared `studio_test` database, so the test preload takes a Postgres advisory lock (`acquireTestSuiteLock` in `@repo/testing`) and parallel runs queue.
- After editing any `packages/*` source, rebuild it before running tests: `pnpm --filter @repo/<pkg> build`. The API resolves injected dist copies; without a rebuild the tests run stale code.
- One-time database setup: `pnpm --filter @repo/api test:setup`.

## Before finishing

- Does every API-level acceptance criterion have a test, mapped in the PR body?
- Did every new test go red first, for the right reason?
- Are response schemas strict?
- Full suite green?
