# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, and others) when working with code in this repository. `CLAUDE.md` is a symlink to this file.

## Commands

```bash
pnpm dev                       # all apps and packages via Turborepo
pnpm build
pnpm lint                      # oxlint
pnpm format                    # oxfmt (single quotes); CI runs pnpm format:check
pnpm check-types
pnpm check:web-type-graph      # after check-types: fails if the web type-check loads a server-only package
pnpm check:agents-md           # fails if the map below misses an app or package
pnpm gen package --args my-pkg "short description"   # scaffold a new @repo/* package

pnpm --filter @repo/database db:generate   # migration from schema changes
pnpm --filter @repo/database db:push       # push schema to the dev DB (dev only)

pnpm test:api                  # apps/api/test/README.md; one-time: pnpm --filter @repo/api test:setup
pnpm test:worker               # apps/worker/test/README.md; same test:setup
pnpm test:e2e                  # Playwright, apps/web/e2e/README.md

# After editing any @repo/* package (including @repo/testing), rebuild it through pnpm. This also re-syncs the
# injected copies consumers resolve (syncInjectedDepsAfterScripts; see packages/testing/README.md).
pnpm --filter @repo/<pkg> build

# Upgrade Nuxt from apps/web with its CLI, never by editing package.json
pnpm exec nuxt upgrade --dedupe --channel stable

# Last resort if stale code still resolves after a rebuild (pnpm built-in, wipes node_modules workspace-wide)
pnpm clean && pnpm install
```

## Architecture

A **pnpm + Turborepo monorepo**. Packages are compiled with **tsdown** and exported as ESM (`.mjs`). The API, worker
and webbrowser run on **Bun**. Every package states its purpose in the `description` of its `package.json`.
`pnpm check:agents-md` fails when an app or package below is missing or no longer exists.

| To change                                      | Look in                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| REST routes, request validation, WebSocket     | `apps/api` (Hono): `src/controllers` (routes only), `src/services` (logic), `src/validation`, `src/ws` |
| Pages, components, composables                 | `apps/web` (Nuxt 4 SPA, shadcn-vue, Tailwind v4, TanStack Form + Zod)                                  |
| Background jobs and crons                      | `apps/worker` (`src/processors`, `src/crons`) and `@repo/queue` (queue names, job DTOs)                |
| Web scraping and browser automation            | `apps/webbrowser` (Hono + Puppeteer, internal only)                                                    |
| User docs at docs.ragna.io                     | `apps/docs` (Astro + Nimbus, see `apps/docs/AGENT.md`; deployed by Cloudflare Workers Builds)          |
| Schema, migrations, repositories               | `@repo/database` (Drizzle ORM on PostgreSQL, `snake_case` columns)                                     |
| Sign-in, sessions, OAuth provider              | `@repo/auth` (better-auth; `@repo/auth/server` and `@repo/auth/client`)                                |
| AI models, agent tools, usage                  | `@repo/ai` (Vercel AI SDK)                                                                             |
| Vendor connections and connectors              | `@repo/integrations`, `@repo/mail` (mail templates and providers)                                      |
| Files and media                                | `@repo/storage` (S3-compatible), `@repo/media`, `@repo/media-transform` (worker only), `@repo/export`  |
| Rich-text editor                               | `@repo/editor` (Tiptap v3)                                                                             |
| Workflows                                      | `@repo/workflow`                                                                                       |
| Env vars, secrets, encryption, logging, errors | `@repo/config`, `@repo/crypto`, `@repo/logger`, `@repo/api-errors` (RFC 9457 problem details)          |
| Shared helpers, test helpers, tsconfig         | `@repo/utils`, `@repo/testing`, `@repo/ts-config`                                                      |

### Key patterns

**API layers**: controllers in `apps/api` only declare routes, validate input and call a service. Logic, helpers and
their interfaces live in the service file.

**AI tool schemas**: an agent tool's `inputSchema` is a flat `z.object` at the top level. A top-level union or
discriminated union makes Anthropic reject the request (`input_schema.type: Field required`).

**New packages**: look like their siblings. Module folders, subpath exports, a client-safe entry when the web uses it,
DTOs as zod schemas. Load the system-design skill first: a new package needs a reason.

**Queue/Worker pattern**: To add a new background job: (1) add a queue name constant in `@repo/queue/src/constants/`, (2) add a DTO in `@repo/queue/src/dtos/`, (3) add a processor in `apps/worker/src/processors/`, (4) register it in `apps/worker/src/processors/index.ts`.

**Config/secrets**: All env vars route through `@repo/config`. Sensitive values use `config.getSecret('KEY')` (redacted from logs, not encrypted); non-sensitive ones are direct properties.

**shadcn-vue components**: Add new UI components via `npx shadcn-vue@latest add <component>` from `apps/web/`. Components land in `app/components/ui/`.

**CSS tokens**: colours in `apps/web` CSS are `oklch()`, sizes are `rem` (16px = 1rem). `px` stays only for hairlines,
shadow offsets and keyframe nudges. `app/assets/css/tokens.css` is generated from the design file: never edit it by
hand; ask for a design change instead. `main.css` maps shadcn names onto it. Design tools such as FigCraft hand over
`#hex` and `px`; convert them with the oklch-conversion skill's script, never by hand or verbatim.
New `--text-*`, `--spacing-*` or `--shadow-*` names also go into `cn` in `app/lib/utils.ts`: tailwind-merge doesn't
read `@theme`, so without them `cn` can't resolve conflicts like `px-card` vs `p-0`.
Controls focus with a 2px ink ring and a 2px offset. To switch it off inside a composite (input group, cell editor),
use `focus-visible:ring-0 focus-visible:ring-offset-0`: in Tailwind v4 the offset alone still draws the ring.

**migrations**: Local dev: push schema directly to DB with `db:push`, don't hand-write SQL. Anything destined for
production goes through `db:generate` (commits SQL under `packages/database/drizzle/`) and is applied by the
`migrate` service (`packages/database/src/scripts/migrate.ts` and the `migrate` entry in `docker/docker-compose.yml`).
`db:push` must never run against a production database, and never with `--force`: it can drop tables the local
schema doesn't know, including those of another branch.

**new DB tables**: Register every new table in `packages/database/src/schema/relations.ts` (add it to the `defineRelations` `schema` object plus its FK relations), not just export it from `schema/index.ts`. The `db` instance is built with `drizzle({ relations })`, so a table missing from that graph throws a runtime "database relation is missing" error, even for plain query-builder calls.

### Infrastructure dependencies

- **PostgreSQL** (localhost:5437): database runs in a docker container.
- **Redis** (localhost:6381): required for BullMQ worker queues and runs in a docker container.
- **SMTP** (localhost:2525): Mailpit or similar for local email testing.
- **Web dev server**: runs on port **3000** (`http://localhost:3000`).
- **API dev server**: runs on port **3010** (`http://localhost:3010`).
- **e2e servers**: Playwright starts its own API and web on ports 3100 and 3110, next to `pnpm dev`.

Agents never run docker commands. The developer owns the containers. If Postgres or Redis is down, stop and report it.

### Typescript

`as any` types are **strictly prohibited**. never use them.

### Database queries

**No N+1 queries.** Never query the database once per item of a list, neither in a loop nor via
`Promise.all(items.map(...))`. Load related rows for the whole list in one query (`inArray`, a join,
`GROUP BY`, or a window function such as `ROW_NUMBER() OVER (PARTITION BY ...)`) and group in memory.
A fan-out is fine only when validation caps it at a handful of items (e.g. max 5 team members).
Reviewers treat a new per-item query on a request path as a blocking issue.

### Standards

Repo-wide standards (deletion, retention, and more to come) live in `specs/standards/`. Follow
every standard there whose status is `decided` or `implemented`. Every feature PRD answers the
checklist in `specs/standards/README.md`.

Domain terms (roles, integrations, connections, agent tools, ...) follow `specs/glossary.md`. Use the
term it names, never a word from its _Avoid_ list, and add new terms in the same PR.

### Coding

For the end-to-end loop from issue to merged PR (assess, options, PRD approval, delegating to worker agents,
integration pass), follow the issue-workflow skill. Load the skills below **before** recommending anything on an
issue or design, not only when writing code.

Always load the clean-code skill. For `apps/api` changes, also load the tdd skill. Before designing anything with
variants or a new abstraction, load the system-design skill; for a vendor connector, also integration-connector.
Before adding a dependency, load the dependency-choice skill. For PRDs, design
docs and slices in `specs/`, load the spec-writing skill.

All skills live in the root `.agents/skills` (`.claude/skills` links to it), never in an app or package folder:
skills in a subfolder don't load for worker agents. Third-party skills are tracked in the root `skills-lock.json`. Our copy of shadcn-vue runs its CLI with
`--cwd .../apps/web`: re-apply that after `npx skills update`. Remove a third-party skill with `npx skills remove`,
never by deleting its folder: the next update reinstalls anything still in the lock.

**House rules win.** Where a third-party skill disagrees with AGENTS.md or the house skills (clean-code, tdd,
system-design, spec-writing, ...), follow the house rule. Known clashes in the Vue and Tailwind skills: no scoped
CSS, `withDefaults` instead of props destructuring, `~` imports instead of `@`, no inline `style` for static values,
design tokens instead of Tailwind's default colours and `px` values.

**Lead and worker agents.** The lead is the agent the developer talks to. A worker is an agent the lead spawned,
normally `repo-worker` (`.claude/agents/repo-worker.md`). The next paragraph is for the lead only. A worker stays on
the branch and checkout it was started in, never creates branches or worktrees, never commits, pushes or opens PRs,
and runs `db:push`, shared package rebuilds and e2e only when its brief says so.

**Branches and worktrees (lead only)**: start every task on a new branch from `origin/main`. If the checkout has
uncommitted changes or another agent works in it, create a worktree instead:
`wt switch --create <branch> --base origin/main` ([worktrunk](https://worktrunk.dev)). Its hooks in `.config/wt.toml`
copy `.env` and the turbo cache, install and build the packages. If `wt` asks to approve hooks, stop and ask the
user; never pass `-y`. Only one worktree can run `pnpm dev` at a time (fixed ports 3000/3010), and all share the
local Postgres and Redis, so never `db:push` from two worktrees with different schemas.

**Delegation (lead only)**: by the developer's standing request, building goes to `repo-worker` agents. The lead
builds itself only for a change in one file with no dependency change, or when the developer says so. The approval
question names the path, e.g. "Build with 2 repo-workers?" (details in the issue-workflow skill).

**Skip self-verification of changes** unless explicitly asked: no visual or browser confirmation, no git status/diff
check, no git commit. The user handles verification and commits. Two exceptions: agents run the tests for what they
change (see TDD below), and run `pnpm check-types` before reporting done (it also covers `apps/api`'s test files,
which `bun test` doesn't type-check).

### TDD (apps/api)

All changes to `apps/api` (and packages reached through it) are test-driven. Load the tdd skill before changing them.

### Branding

In user-facing text and docs, write the brand as `RAGNA` (all caps) and the product as `RAGNA Studio`. Never `Ragna`, `ragna studio` or `RAGNA STUDIO`. Code identifiers, package names and domains stay lowercase (`ragna-studio`, `ragna.io`).

### Design docs

This repo is public. `specs/` holds only technical docs for features that are decided or being built.
Business strategy, pricing, product lineup and undecided drafts live outside this repo; never write them into `specs/`.

A PRD is written on its feature branch and opened as the first commit of that branch's draft PR; the code follows in
the same PR. Never a separate spec-only PR. Review of the spec happens on that draft PR before the build starts.
Spec bookkeeping ships in the same PR as the code, never as a separate docs-only PR: PRD `Status: implemented (date, PR #N)`,
`Closes #N` for its issue in the PR body, `pnpm specs:index`, the `specs/overview.md` entry and the `apps/docs` page.
Any user-visible change (UI, behaviour, config or env vars, self-hosting) updates its `apps/docs` page in the same PR.
If no page exists, say so in the PR body.
Exception: docs about a security fix wait until its advisory is published.

### Issues

Open work lives in GitHub Issues, planned on the org project [RAGNA Studio](https://github.com/orgs/ragna-ai/projects/1).
File a follow-up as an issue, not as a note in `specs/`: `gh issue create --type <Task|Bug|Feature|Epic> --label <area>`.
Split bundled work into sub-issues (`--parent N`). Exploitable security findings never go into public issues.

### Pull requests

Open every PR as a draft (`gh pr create --draft`). The user marks it ready after review.

### Browser use and bug fixes

Login requires OAuth (Google, Microsoft, Apple), so agents can't sign in to automate the browser. Ask the user for
screenshots or details instead. A typecast is not a bug fix.
