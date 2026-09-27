# RAGNA Studio

An AI Agent First App where humans and ai-agents work on the same things: chats, documents, datasets, tasks, and media.

<!-- TODO: screenshot or short GIF of the app -->

RAGNA Studio is a full-stack TypeScript monorepo. AI Agents don't just answer in a chat window. They read and write the same documents, datasets, and kanban boards as the humans in a workspace, run inside visual workflows, and can be reached from Claude Desktop via MCP.

Live app: [app.ragna.io](https://app.ragna.io)

## Features

**Chat and agents**

- Chat with configurable agents across Anthropic, OpenAI, Google, Mistral, and local models (LM Studio)
- Agent context from free text and attached documents, with pgvector retrieval for large contexts
- Persistent agent memory and per-agent default settings
- Branch a conversation into a new chat at any message
- Realtime team chat between workspace members over WebSockets

**Shared workspace**

- Workspaces as the container and permission boundary for every resource
- Markdown documents with a Tiptap editor, shared by humans and agents
- Datasets: spreadsheet-like tables with concurrent agent writes, row reordering, and Excel export
- Linear-style kanban board with labels, subtasks, reminders, and attachments; agents get CRUD tools
- Media library for generated and uploaded images, videos, and files

**Automation and generation**

- Visual, node-based workflow builder with its own interpreter, scheduled triggers, and agent delegation
- Text-to-image and text-to-video (Black Forest Labs FLUX), run as background jobs
- Automatic provenance labeling of AI-generated media
- Email client for Gmail and Outlook with AI categorization and AI reply drafts
- LinkedIn posts: draft and publish from a connected account
- MCP server so Claude Desktop can work with your datasets
- Usage-based credit ledger for metered AI operations

## Documentation

Design docs and PRDs live in [docs/](docs/README.md). Start with the [product overview](docs/overview.md) or the generated [status index](docs/INDEX.md).

## Architecture

```
apps/
  web/          Nuxt 4 SPA (shadcn-vue, Tailwind v4)            :3000
  api/          Hono REST + WebSocket API                       :3010
  worker/       BullMQ job processors and cron jobs
  webbrowser/   Scraping and browser automation service         :3011
packages/
  database/     Drizzle ORM schema and migrations (Postgres + pgvector)
  auth/         better-auth (Google, Microsoft, Apple)
  ai/           Vercel AI SDK provider setup and agent tools
  queue/        BullMQ queues, job DTOs
  workflow/     Workflow engine
  editor/       Tiptap v3 editor kit
  mail/ media/ storage/ export/ linkedin/ logger/ config/ utils/ testing/
```

- **Stack:** TypeScript end to end, pnpm workspaces + Turborepo, tsdown builds, oxlint + oxfmt
- **Data:** PostgreSQL 18 with pgvector, Redis for queues, Cloudflare R2 for files
- **Tests:** API integration tests against a real Postgres and Redis ([apps/api/test](apps/api/test/README.md))
- **Deploy:** one Docker image per app, a migration container, Traefik in front

## Getting started

Requirements: Node.js 24+, pnpm, Bun (seed scripts and tests), Docker.

```bash
pnpm install
cp .env.example .env          # fill in at least DB, Redis, auth, and one AI provider
make up-dev                   # starts Postgres and Redis in Docker
pnpm db:push                  # applies the schema to the local database
pnpm --filter @repo/database db:seed
pnpm dev                      # web, api, and worker
```

Open [localhost:3000](http://localhost:3000). Login uses OAuth, so configure at least one provider (Google, Microsoft, or Apple) in `.env`.

Run the API tests with `pnpm test:setup` once, then `pnpm test:api`.

## License

Copyright (C) 2025-2026 Sven Stadhouders.

Licensed under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).

A commercial license is available for use cases that can't meet the AGPL terms. Contact license@ragna.io.

Pull requests are not accepted at this time.
