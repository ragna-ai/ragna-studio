# Development

Reference doc, not a PRD: no `Status:` line.

## Run from source

Requirements: Node.js 26+, pnpm, Bun (seed scripts and tests), Docker.

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

## Agent and worktree tooling

The repo ships the shared agent setup: `AGENTS.md` (read by Claude Code, Codex and others; `CLAUDE.md` is a symlink), skills in `.agents/skills/` (`.claude/skills` links there), shared Claude Code settings in `.claude/settings.json`, and [worktrunk](https://worktrunk.dev) hooks in `.config/wt.toml`. Put personal overrides in `.claude/settings.local.json`, which is not committed.

One-time setup per machine:

```bash
brew install worktrunk
wt config shell install       # then restart the shell, so `wt switch` can change directory
wt config approvals add       # run inside the repo: approves the hooks in .config/wt.toml
```

Create a worktree with `wt switch --create <branch> --base origin/main`. Its hooks copy `.env` and the turbo cache (see `.worktreeinclude`), run `pnpm install` and build the packages. Worktrunk asks for approval again whenever the hook commands change.

Limits: only one worktree can run `pnpm dev` at a time (fixed ports 3000 and 3010). All worktrees share the local Postgres and Redis, so don't `db:push` from two worktrees with different schemas.

## Architecture

See [architecture.md](./architecture.md) for the system diagram and repository layout.
