# Database migrations and seeding in production

Status: implemented (2026-09-19)

Local dev keeps using `drizzle-kit push` for fast, file-less schema
iteration — that's not changing. This doc covers how a schema (and the
`ai_models`/default-agent seed data) actually reaches a deployed server,
which is a different path than local dev's.

## Why not `db:push` in production

`drizzle-kit push` diffs the live database and applies changes immediately:
no SQL files, no history, no review step, and it can silently drop columns
if a field is removed from the schema. Fine for a solo dev iterating against
one database; not something to run unattended against a server holding real
data.

## The production path: generate + a dedicated migrate image

1. Schema changes are committed as SQL via `drizzle-kit generate`
   (`pnpm --filter @repo/database db:generate`), which writes into
   `packages/database/drizzle/`.
2. `packages/database/Dockerfile` builds a small, single-purpose image
   (`ghcr.io/ragna-ai/ragna-studio-migrate`) containing only `drizzle-orm`,
   `pg`, and the compiled scripts — no `drizzle-kit`, no other app code. It
   follows the same base→pruner→builder→runner pattern as the `api`/
   `worker` images, but uses `node:24-alpine` instead of `node:24-slim`:
   `@repo/database`'s dependency tree (`pg`, `drizzle-orm`, `@repo/workflow`,
   `@repo/utils`) is pure JS, unlike `@repo/media`'s glibc-linked native
   addon, so Alpine is safe here.
3. `docker-compose.yml` runs that image as two one-shot services:
   - `migrate` — `CMD ["node", "dist/scripts/migrate.mjs"]`, applies pending
     SQL from `./drizzle`.
   - `seed` — same image, `command: ["node", "dist/seed/index.mjs"]`,
     upserts `ai_models` and the default agent template.

   `api`/`worker` depend on `seed` with
   `condition: service_completed_successfully`; `seed` itself depends on
   `migrate` the same way. Compose resolves this transitively, so N
   replicas of `api`/`worker` all wait on one completed migrate-then-seed
   run instead of racing each other on boot.

## Why a Postgres advisory lock

`drizzle-orm`'s `migrate()` has no locking of its own
([drizzle-team/drizzle-orm#874](https://github.com/drizzle-team/drizzle-orm/issues/874)).
Two containers starting at once (e.g. a redeploy overlapping the outgoing
container) could otherwise race the same migration. `migrate.ts` and
`baseline.ts` both wrap their work in `pg_advisory_lock`/`pg_advisory_unlock`
on a dedicated `pg.Client` (not the pooled `db` export — the lock is
session-scoped, so it must be taken and released on the same connection).

Gotcha hit while building this: `drizzle({ client })` requires the client
wrapped in a config object. Calling `drizzle(client)` directly silently
falls through to constructing a brand-new default-config `Pool` that ignores
your connection entirely (and the session holding the lock) — it doesn't
throw, it just connects to the wrong thing.

## Why seeding had to become idempotent

`db:seed` used to call `drizzle-seed`'s `reset()` first, truncating every
table before inserting. Safe for "run once by hand on a fresh dev database,"
not safe as an automated step that runs on every deploy. It's now:

- `seedAiModels()` — `INSERT ... ON CONFLICT (provider, model) DO NOTHING`,
  backed by a new unique index (`ai_model_provider_model_idx` on
  `ai_models`). Existing rows are never touched.
- `seedDefaultAgent()` — checks for an existing `agentTemplate` named
  `'RAGNA Agent'` first and returns early if found (no natural unique
  business key there, so this is an app-level check rather than a DB
  constraint).

Both `migrate` and `seed` re-run on every `docker compose up`/restart (they're
one-shot, not long-running services, so Compose starts them again each time).
That's expected and cheap: they no-op once there's nothing left to do.

## Reconciling an existing `db:push`'d database

A database that's only ever been touched by `db:push` (true for every local
dev database, and would have been true for this project's server before this
was built) already has the current schema, but has never run through
`migrate`, so its `drizzle.__drizzle_migrations` tracking table is empty. A
real `migrate` run in that state tries to `CREATE TYPE`/`CREATE TABLE`
statements that already exist and fails.

`pnpm --filter @repo/database db:baseline` (`packages/database/src/scripts/baseline.ts`)
fixes this without touching any table's data or structure: it uses
drizzle-orm's own `readMigrationFiles()` (from `drizzle-orm/migrator`) to
compute the same hash/name a real `migrate()` run would, then records each
migration as applied directly in `drizzle.__drizzle_migrations`. Run once per
database that predates this setup. Never needed for a database that started
out empty and went through `migrate` from the start.

This is a manual, `bun`-run script (`db:baseline`, same convention as
`db:seed`/`db:backup`/`credits:grant`) — it's not part of the `migrate`
image, since production databases here start empty and never need it.

## Squashing migration files

Multiple migration files generated while iterating on a change that hasn't
shipped anywhere yet can be squashed into one: delete the migration folders
under `packages/database/drizzle/` and re-run `db:generate` against the
current schema. Only safe when no database has recorded those migrations as
applied yet (check `drizzle.__drizzle_migrations` on anything that matters,
or just recreate it if it's disposable) — once a migration has shipped to a
database you don't control, treat it as immutable and add a new one instead.
