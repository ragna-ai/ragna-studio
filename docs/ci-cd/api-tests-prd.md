# API tests in CI (PRD)

> **Status: in-progress** (2026-09-29). Implements phase 3 of [prd.md](./prd.md).
> The `api-tests` job is written; the first green run on a PR is still open.

`pnpm test:api` (513 tests, about 20 seconds) only runs on a developer machine.
A change can break it without anyone noticing. On 2026-09-29 the suite sat at
342 failures after an unrelated dependency bump (the cause was the earlier
email-allowlist commit, see [Findings](#findings)). CI never ran it.

## Goals

- Run the API integration tests on every PR to `main`.
- A red test run blocks the merge, once `api-tests` is a required check.
- Zero repo secrets. Dummy values only.

## Non-goals

- Running on pushes to `main`. The PR run already covers it.
- Sharding, path filters, or a database cache. The suite is small.
- Worker tests, Playwright, or any other suite.
- A Redis service. See below.

## How other projects do it

Checked on 2026-09-29.

| Repo | Test database | Env handling |
| --- | --- | --- |
| twenty | `postgres:18` and `redis` as `services:`, health check on Postgres | Generated `.env.test`, dummy values |
| cal.com | `postgres:18` as a service, health check | About 30 repo secrets and vars |
| documenso | `docker compose` through `npm run dx:up` | `cp .env.example .env` |
| Plane | No database for its migration check | Dummy job-level env |

Service containers are the common choice. Dummy env beats secrets.

## Design

A second job, `api-tests`, in `.github/workflows/ci.yml`.

- **Trigger:** `pull_request` only, through `if: github.event_name == 'pull_request'`.
  The file's `paths-ignore` for docs still applies.
- **Postgres:** `pgvector/pgvector:0.8.6-pg18-trixie` as a service, the same
  image as `docker-compose.yml`. Superuser `postgres`, with a health check.
  `test:setup` creates `studio_test` and the extensions itself, so the
  `docker/postgres-init.sql` mount is not needed.
- **No Redis.** Every queue call is faked with `mock.module()`
  ([testing strategy](../testing/strategy.md)), and nothing under
  `apps/api/test` or `packages/testing` connects to Redis. If a test ever
  needs it, add a `redis:8.8.0-alpine3.23` service (no password) then.
- **Bun:** `oven-sh/setup-bun`, pinned to a SHA and to Bun `1.3.14`, the
  version used locally. `apps/api` tests run with `bun test`, and the test
  database script uses `Bun.SQL`.
- **Env:** job-level, dummy values: `DB_HOST`, `DB_PORT`, `DB_USERNAME`,
  `DB_PASSWORD`, `ENCRYPTION_PASSWORD` (16+ characters), `BETTER_AUTH_SECRET`.
  `DB_DATABASE`, `CREDITS_ENABLED`, and `REDIS_DB` come from `.env.testing`,
  which `@repo/config` loads when `NODE_ENV=test`.
- **Steps:** checkout, pnpm, Node 24, Bun, `pnpm install --frozen-lockfile`,
  `pnpm turbo run build --filter=@repo/api...`, `pnpm test:setup`,
  `pnpm --filter @repo/api test`.
- **Tests run without turbo.** `pnpm test:api` goes through `turbo run`, whose
  strict env mode drops `DB_*` and the other job-level vars. The tests then
  fall back to the default password and fail with "password authentication
  failed for user postgres". Locally a root `.env` hides this.
- **Build through pnpm, no turbo cache.** Same reason as the `ci` job: a cache
  hit skips the build script, so injected copies are never synced.
- **Actions pinned to SHAs**, like the other workflows.

## Findings

- `ALLOWED_LOGIN_EMAILS` must stay unset in CI. With it set, better-auth needs
  an endpoint context for `validateUserInfo`, and test user seeding fails.
  Since [PR #46](https://github.com/ragna-ai/ragna-studio/pull/46),
  `packages/auth` registers the hook only when the allowlist is set.
- The first CI run on a branch cut from a `main` without that fix fails
  with `validation_context_missing`. Merge #46 first.

## To verify

- The first PR run is green. Fix the env list if `@repo/config` complains
  about a missing value.
- Bun `1.3.14` matches the `bun-types` in the lockfile closely enough. Bump the
  pin together with local Bun.
- Wall time of the job. The PRD estimate for CI was 60 to 90 seconds per run.

## Decisions

Pending: make `api-tests` a required check on `main`. It is set by hand in the
GitHub settings and is not part of the repo.
