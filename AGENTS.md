# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, and others) when working with code in this repository. `CLAUDE.md` is a symlink to this file.

## Commands

```bash
# Development (runs all apps and packages in parallel via Turborepo)
pnpm dev

# Build everything
pnpm build

# Lint (oxlint)
pnpm lint

# Type-check
pnpm check-types

# Scaffold a new @repo/* package (interactive or non-interactive)
pnpm gen package
pnpm gen package --args my-pkg "short description"

# Database (run from packages/database)
pnpm --filter @repo/database db:generate   # generate migration from schema changes
pnpm --filter @repo/database db:push       # push schema directly to DB (dev only)
pnpm --filter @repo/database db:pull       # introspect DB into schema

# API integration tests (see apps/api/test/README.md; one-time `pnpm --filter @repo/api test:setup` first)
pnpm test:api

# Run a specific app or package task
pnpm --filter @repo/web dev
pnpm --filter @repo/worker dev

# After editing any @repo/* package (including @repo/testing, whose build is a no-op sync trigger),
# rebuild it through pnpm — this also re-syncs the frozen .pnpm copies that injected consumers resolve
# (syncInjectedDepsAfterScripts in pnpm-workspace.yaml; see packages/testing/README.md)
pnpm --filter @repo/<pkg> build

# Clean install (wipes node_modules workspace-wide via pnpm's built-in command, not a package.json
# script). Fallback if something still resolves stale code after a rebuild.
pnpm clean
pnpm install
```

Formatting uses **oxfmt** (single quotes). Linting uses **oxlint**.

## Architecture

This is a **pnpm + Turborepo monorepo** with two apps and several shared packages. All packages are compiled with **tsdown** (Rolldown-based TypeScript bundler) and exported as ESM (`.mjs`).

### Apps

- **`apps/web`** — Nuxt 4 SPA (`ssr: false`). Uses shadcn-vue (New York style, stone base, Tailwind v4), `@tanstack/vue-form` + Zod for forms, `@vueuse/nuxt`, `vue-sonner` for toasts, and `@nuxt/icon` / `@nuxt/fonts` / `@nuxt/image`.
- **`apps/docs`**: public product docs at `docs.ragna.io`. Static Astro site scaffolded with Nimbus (`@cloudflare/nimbus-docs`). See `apps/docs/AGENT.md`. Deployed to Cloudflare Workers by Workers Builds, not part of the Docker release.
- **`apps/worker`** — standalone Node.js process (compiled via tsdown). Consumes BullMQ queues and runs cron jobs. Entry point: `src/index.ts` → connects to Redis, registers processors from `src/processors/`, optionally starts cron jobs from `src/crons/`.

### Shared Packages (`packages/`)

| Package           | Purpose                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@repo/config`    | Singleton `ConfigService` wrapping env vars; loaded via `dotenv` pointing to root `.env`. All other packages use `config.getSecret(...)` or direct properties.                             |
| `@repo/database`  | Drizzle ORM + better-sqlite3. Schema lives in `src/schema/`. Migrations in `drizzle/`. Uses `snake_case` column naming.                                                                    |
| `@repo/auth`      | better-auth with Drizzle adapter. Has **two export paths**: `@repo/auth/server` (auth instance, event handler) and `@repo/auth/client` (browser auth client). Google OAuth + admin plugin. |
| `@repo/queue`     | BullMQ wrapper. Defines queue/worker/cron factories in `src/services/bullmq.service.ts`. Queue names and job constants in `src/constants/`. Job DTOs in `src/dtos/`.                       |
| `@repo/mail`      | Nodemailer + MJML + Brevo transport. Template-based `sendEmail()` with `templateId` and `variables`.                                                                                       |
| `@repo/ai`        | Vercel AI SDK configured for Anthropic, OpenAI, Google, and Black Forest Labs models. Exports factories and tool definitions.                                                              |
| `@repo/storage`   | `s3mini` (lightweight S3-compatible client) pointed at Cloudflare R2 (`BucketService`).                                                                                                    |
| `@repo/editor`    | Tiptap v3 rich-text editor (Vue 3 extensions).                                                                                                                                             |
| `@repo/logger`    | Consola-based structured logger. Log level controlled by `config.logLevel`.                                                                                                                |
| `@repo/utils`     | Tiny utilities: `tryCatch` (async error handling) and `retryExpoBackoff`.                                                                                                                  |
| `@repo/ts-config` | Shared `tsconfig/base.json` extended by all packages.                                                                                                                                      |

### Key patterns

**Queue/Worker pattern**: To add a new background job — (1) add a queue name constant in `@repo/queue/src/constants/`, (2) add a DTO in `@repo/queue/src/dtos/`, (3) add a processor in `apps/worker/src/processors/`, (4) register it in `apps/worker/src/processors/index.ts`.

**Config/secrets**: All env vars route through `@repo/config`. Sensitive values use `config.getSecret('KEY')` (encrypted at rest); non-sensitive ones are direct properties.

**shadcn-vue components**: Add new UI components via `npx shadcn-vue@latest add <component>` from `apps/web/`. Components land in `app/components/ui/`.

**migrations**: Local dev: push schema directly to DB with `db:push`, don't hand-write SQL. Anything destined for
production goes through `db:generate` (commits SQL under `packages/database/drizzle/`) and is applied by the
`migrate` service — see `packages/database/src/scripts/migrate.ts` and the `migrate` entry in `docker/docker-compose.yml`.
`db:push` must never run against a production database.

**new DB tables**: Register every new table in `packages/database/src/schema/relations.ts` (add it to the `defineRelations` `schema` object plus its FK relations), not just export it from `schema/index.ts`. The `db` instance is built with `drizzle({ relations })`, so a table missing from that graph throws a runtime "database relation is missing" error, even for plain query-builder calls.

### Infrastructure dependencies

- **PostgreSQL** (localhost:5437): database runs in a docker container.
- **Redis** (localhost:6381): required for BullMQ worker queues and runs in a docker container.
- **SMTP** (localhost:2525): Mailpit or similar for local email testing.
- **Web dev server**: runs on port **3000** (`http://localhost:3000`).
- **API dev server**: runs on port **3010** (`http://localhost:3010`).

### Typescript

`as any` types are **strictly prohibited**. never use them.

### Coding

Always load the clean-code skill. For `apps/api` changes, also load the tdd skill.

**Skip self-verification of changes** unless explicitly asked, means:

- no type-check at all,
- no visual confirmation,
- no git status/diff check,
- no git commit,
- no browser verification

The user handles verification and commits. The one exception is running tests: agents run the tests
for what they change (see TDD below).

### TDD (apps/api)

All changes to `apps/api` (and packages reached through it) are test-driven. Load the tdd skill before changing them.

# Browser use

Login requires OAuth (Google/Microsoft/Apple) so you can't easily automate because you don't have credentials. Ask the user to share images or details if required.

# BugFix

Typecast is not a bugfix.
