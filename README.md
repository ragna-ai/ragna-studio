# RAGNA Studio

**The self-hosted AI workspace where agents are your co-workers.**

RAGNA Studio gives your agents a place to work.
They read your documents, keep their state in datasets, delegate to each other, and run on a schedule while you sleep.
You host it. You own the data. You bring your own model keys, or run local models.

<!-- TODO: hero screenshot or GIF: an agent filling a dataset row while the grid is open -->

## Getting started

### Docker


```bash
cp .env.example .env          # fill in secrets, storage, one OAuth provider, and one AI key
make up-dev-full              # pulls the images and starts the whole stack
```

The stack starts in order. Postgres comes up first. The `migrate` container applies the schema. The `seed` container adds the model catalog and the default agent. Then the backend, worker, frontend, and webbrowser start. Both one-shot containers are idempotent, so upgrading is just pulling newer images and starting again.

Open [localhost:3000](http://localhost:3000). Login uses OAuth, so configure at least one provider (Google, Microsoft, or Apple) in `.env`.

<details>
<summary>What you need to self-host</summary>

| Need | For |
| --- | --- |
| PostgreSQL 18 with pgvector (the compose file ships the image) | Everything |
| Redis | Queues and schedules |
| S3-compatible storage (configured for Cloudflare R2) | Files and generated media |
| One OAuth login: Google, Microsoft, or Apple | Sign-in |
| At least one LLM key | Chat and agents |

Optional pieces, each enabled by its own env vars:

- An OpenAI key for embeddings, which power retrieval over large knowledge bases
- A Black Forest Labs key for FLUX images and video, or Google Vertex for Imagen and Veo
- A SerpAPI key for web search
- Google or Microsoft OAuth with mail scopes for the email client
- A LinkedIn app for publishing drafts
- System ffmpeg for the AI-generated video badge
- An email allowlist (`ALLOWED_LOGIN_EMAILS`) to control who can sign in

</details>

### Develop from source

Requirements: Node.js 24+, pnpm, Bun (seed scripts and tests), Docker.

```bash
pnpm install
cp .env.example .env          # fill in at least DB, Redis, auth, and one AI provider
make up-dev                   # starts Postgres and Redis only
pnpm db:push                  # pushes the schema straight to the local database
pnpm --filter @repo/database db:seed
pnpm dev                      # web, api, and worker with hot reload
```

`db:push` is for local development only. Never run it against a production database. Production schema changes ship as generated SQL and are applied by the `migrate` container.

Run the API tests with `pnpm test:setup` once, then `pnpm test:api`.

## Why RAGNA Studio

### One workspace per use case, with its own expert agents

Every resource lives in a workspace: agents, datasets, documents, tasks, chats, workflows, and media.
Create one for sales, one for content, one for the back office.

Each agent is a specialist, with:

- Its own instructions, model, and reasoning effort.
- Its own knowledge: PDFs, Word files, text, or markdown. Small sets go into the prompt. Large sets switch to vector based retrieval (RAG) automatically.
- Its own memory, which it writes itself and carries into every later chat.
- Its own toolset, toggled per agent: web search, web browsing, datasets, documents, tasks, image and video generation, LinkedIn drafts.
- An optional pinned dataset, so it works on the right table without searching.

Agents only see the workspace they run in.

<!-- TODO: screenshot: agent config with knowledge documents and tool toggles -->

### Datasets: spreadsheets your agents work in

A dataset is a table with typed columns: text, number, date, or select.
You edit it in a grid. Agents read and write it through tools. An agent can also create a dataset and write its own plan as rows.

- **A work queue.** A status column says what is todo, drafted, or done.
- **Durable agent state.** Runs resume where the last one stopped.
- **A shared surface.** Every row records whether a user, an agent, or an outside app wrote it.

Writes are validated against the column schema, so a bad agent write becomes a visible tool error. Export any dataset to Excel.

<!-- TODO: screenshot: dataset grid with agent-written rows and the row detail panel -->

### Agent teams that run on their own

Build workflows on a visual canvas and give them a cron schedule. Add a **team** node: a lead agent delegates to up to five specialists in parallel, reads their reports, and re-delegates until the job is good enough.

Every run keeps a full trace: the lead's decisions, each delegation, every tool call, timing, and token use.
Failed runs retry and resume from the last completed step.

<!-- TODO: screenshot: workflow canvas with a schedule trigger and a team node -->
<!-- TODO: screenshot: run trace with an expanded delegation -->

### Email that drafts for you

Connect Gmail or Outlook. Incoming mail is sorted into categories you define.
Mark a category or sender to auto-draft, and a configurable agent writes the reply from its own knowledge.
You review every draft. Nothing is sent without you.

<!-- TODO: screenshot: mail view with an AI draft above the thread -->

### MCP Server

Turn on the built-in MCP server and add RAGNA as a connector.
For example Claude Desktop can find datasets, read rows, append and update rows, and create tables in the workspace you pick.
It is off by default. Access is Off, Read, or Read and write per resource, and every write is logged.

<!-- TODO: screenshot: MCP settings page with the connector URL and access levels -->

## What you can build (examples)

**A back-office automation.**
Connect the shared mailbox and define categories such as invoice, support, and order. An expert agent that knows your price list, contracts, and FAQ drafts the email replies. You edit and send.

**A LinkedIn content pipeline.**
You drop headlines into a Topics dataset. A scheduled team workflow takes the next `todo` row. A researcher, a writer, and a designer produce a LinkedIn draft with images. The row moves to `drafted`. You review and publish.

**A lightweight CRM.**
A Leads dataset holds company, contact, stage, and next step. A nightly workflow researches rows at `stage = new`, fills in a summary, and moves the stage. A second agent drafts follow-ups for quiet leads.

**And much more**
due to the modular system which can be freely configured by you and your ai agent, simply ask it.

<details>
<summary>Everything in the box</summary>

**Agents and chat**

- Models from Anthropic, OpenAI, Google (GenAI and Vertex), Mistral, and local models through LM Studio
- Streaming chat over WebSockets, with stop, branching at any message, and full-text chat search
- Attach images, PDFs, Word, Excel, and text files to a message
- Notifications for finished runs and generated media

**Shared workspace**

- Markdown documents with a rich-text editor, in folders, shared by you and your agents
- Kanban board with labels, subtasks, due dates, reminders, and file attachments. Agents get create, update, and move tools.
- Media library for every generated and uploaded file, with reference counting so shared files are never deleted early
- Home overview with the latest tasks, chats, workflows, agents, and documents

**Generation**

- Text-to-image with FLUX, OpenAI, and Imagen. Negative prompts, seeds, and reference images where the model supports them.
- Text-to-video with FLUX 3 video and Veo. Draft mode gives a cheap preview that you can enhance to full quality later.
- Jobs run in the background and notify you when done
- Optional visible "AI generated" badge on images and videos, for EU AI Act disclosure

**Automation**

- Visual workflow builder with manual and cron triggers, agent nodes, team nodes, conditions, and transforms
- Overlap protection for schedules, plus a sweeper for stuck runs
- Scraping service with a stealth headless browser, so agents can read real pages
- Optional usage-based credit ledger for metered AI operations (off by default)

</details>

<details>
<summary>Architecture</summary>

```
apps/
  web/          Nuxt 4 SPA (shadcn-vue, Tailwind v4)            :3000
  api/          Hono REST + WebSocket + MCP API                 :3010
  worker/       BullMQ job processors, workflow engine, crons
  webbrowser/   Scraping and browser automation service         :3011
packages/
  database/     Drizzle ORM schema and migrations (Postgres + pgvector)
  auth/         better-auth (Google, Microsoft, Apple) and MCP OAuth
  ai/           Vercel AI SDK provider setup and agent tools
  queue/        BullMQ queues, job DTOs
  workflow/     Workflow definitions, validation, cron helpers
  editor/       Tiptap v3 editor kit
  mail/ media/ storage/ export/ linkedin/ logger/ config/ utils/ testing/
```

- **Stack:** TypeScript end to end, pnpm workspaces + Turborepo, tsdown builds, oxlint + oxfmt
- **Agents:** Vercel AI SDK. Each tool is defined once and adapted for chat, workflows, and MCP.
- **Workflows:** a hand-written interpreter over a JSON graph. No user code runs. Users compose a closed catalog of nodes.
- **Tests:** API integration tests against a real Postgres and Redis ([apps/api/test](apps/api/test/README.md))

</details>

## Documentation

Design docs and PRDs live in [docs/](docs/README.md). Start with the [product overview](docs/overview.md) or the generated [status index](docs/INDEX.md).

## License

Copyright (C) 2025-2026 Sven Stadhouders.

Licensed under the [AGPL v3.0](LICENSE).
