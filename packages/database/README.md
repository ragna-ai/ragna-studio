# @repo/database

Drizzle ORM + `pg`, Postgres. Schema lives in `src/schema/`.

## Commands

| Command              | When                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| `pnpm db:push`       | Local dev, iterating on schema.ts. Never against a database with real data. |
| `pnpm db:generate`   | Before shipping a schema change: writes SQL into `drizzle/`, commit it.     |
| `pnpm db:migrate`    | Applies pending `drizzle/` SQL. Runs automatically in prod (see below).     |
| `pnpm db:seed`       | Upserts `ai_models` + the default agent template. Safe to run repeatedly.   |
| `pnpm db:baseline`   | One-time: reconcile a `db:push`-only database with `db:migrate`'s tracking. |
| `pnpm db:backup`     | Dumps prod Postgres via `pg_dump` inside the running container.             |
| `pnpm credits:grant` | Manual credit grant, see `src/scripts/grant-credits.ts`.                    |

## Production deploys don't use `db:push`

A dedicated `packages/database/Dockerfile` image runs `db:migrate`/`db:seed`
as one-shot `docker/docker-compose.yml` services ahead of `api`/`worker`. Full
design, the Postgres advisory lock, why seeding had to become idempotent,
and how to reconcile a pre-existing `db:push`-only database:
[specs/database/migrations-and-seed.md](../../docs/database/migrations-and-seed.md).
