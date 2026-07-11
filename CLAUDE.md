# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

# Run a specific app or package task
pnpm --filter @repo/web dev
pnpm --filter @repo/worker dev
```

Formatting uses **oxfmt** (single quotes). Linting uses **oxlint**.

## Architecture

This is a **pnpm + Turborepo monorepo** with two apps and several shared packages. All packages are compiled with **tsdown** (Rolldown-based TypeScript bundler) and exported as ESM (`.mjs`).

### Apps

- **`apps/web`** — Nuxt 4 SPA (`ssr: false`). Uses shadcn-vue (New York style, stone base, Tailwind v4), VeeValidate + Zod for forms, `@vueuse/nuxt`, `vue-sonner` for toasts, and `@nuxt/icon` / `@nuxt/fonts` / `@nuxt/image`.
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
| `@repo/storage`   | AWS S3 SDK pointed at Cloudflare R2 (`BucketService`).                                                                                                                                     |
| `@repo/editor`    | Tiptap v3 rich-text editor (Vue 3 extensions).                                                                                                                                             |
| `@repo/logger`    | Consola-based structured logger. Log level controlled by `config.logLevel`.                                                                                                                |
| `@repo/utils`     | Tiny utilities: `tryCatch` (async error handling) and `retryExpoBackoff`.                                                                                                                  |
| `@repo/ts-config` | Shared `tsconfig/base.json` extended by all packages.                                                                                                                                      |

### Key patterns

**Queue/Worker pattern**: To add a new background job — (1) add a queue name constant in `@repo/queue/src/constants/`, (2) add a DTO in `@repo/queue/src/dtos/`, (3) add a processor in `apps/worker/src/processors/`, (4) register it in `apps/worker/src/processors/index.ts`.

**Config/secrets**: All env vars route through `@repo/config`. Sensitive values use `config.getSecret('KEY')` (encrypted at rest); non-sensitive ones are direct properties.

**shadcn-vue components**: Add new UI components via `npx shadcn-vue@latest add <component>` from `apps/web/`. Components land in `app/components/ui/`.

### Infrastructure dependencies

- **SQLite** (dev): `DATABASE_URL` points to `sqlite.db` at repo root.
- **Redis** (localhost:6381): required for BullMQ worker queues.
- **SMTP** (localhost:2525): Mailpit or similar for local email testing.
- **Web dev server**: runs on port **3004** (`http://localhost:3004`).

### Coding

Skip self-verification of changes unless explicitly asked:

- no type check
- no visual confirmation
- no git status/diff check
- no git commit
- no browser verification

The user handles verification and commits.
