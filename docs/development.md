# Development

Reference doc, not a PRD: no `Status:` line.

## Run from source

Requirements: Node.js 24+, pnpm, Bun (seed scripts and tests), Docker.

```bash
pnpm install
cp .env.example .env          # fill in at least DB, Redis, auth, and one AI provider
make up-dev                   # starts Postgres and Redis only
pnpm db:push                  # pushes the schema straight to the local database
pnpm --filter @repo/database db:seed
pnpm dev                      # web, api, and worker with hot reload
```

The web app runs on [localhost:3000](http://localhost:3000). The API runs on port 3010.

`db:push` is for local development only. Never run it against a production database. Production schema changes ship as generated SQL and are applied by the `migrate` container.

## Tests

Run the API tests with `pnpm test:setup` once, then `pnpm test:api`. See [apps/api/test](../apps/api/test/README.md).

## Architecture

See [architecture.md](./architecture.md) for the system diagram and repository layout.
