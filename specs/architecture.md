# Architecture

Reference doc, not a PRD: no `Status:` line.

```mermaid
flowchart TB
  User[Browser user] --> Web[Web app: Nuxt SPA]
  Web -->|REST, WebSocket| Api[Backend API: Bun + Hono + Zod]
  Desktop[MCP client, e.g. Claude Desktop] -->|MCP| Api
  Login[OAuth: Google, Microsoft] <--> Api
  Api --> Queue[BullMQ: Redis job queues]
  Queue --> Worker[BullMQ Workers: jobs, workflows, crons, ai-agents]
  Api --> Agents[AI Agents and Tools]
  Worker --> Agents
  Agents --> LLMs[LLM providers]
  Agents --> Browser[Webbrowser]
  Agents --> Search[Web search]
  Agents --> Gen[Image and video models]
  Agents --> Datasets[Datasets, documents, tasks]
  Api <--> Mail[Email: Gmail, Outlook]
  Worker <--> Mail
  Api --> DB[(PostgreSQL + pgvector)]
  Worker --> DB
  Api --> Files[(S3 / R2 media)]
  Worker --> Files
```

## Repository layout

```
apps/
  web/          Nuxt 4 SPA (shadcn-vue, Tailwind v4)            :3000
  api/          Hono REST + WebSocket + MCP API                 :3010
  worker/       BullMQ job processors, workflow engine, crons
  webbrowser/   Scraping and browser automation service         :3011
packages/
  database/     Drizzle ORM schema and migrations (Postgres + pgvector)
  auth/         better-auth (Google, Microsoft) and MCP OAuth
  ai/           Vercel AI SDK provider setup and agent tools
  queue/        BullMQ queues, job DTOs
  workflow/     Workflow definitions, validation, cron helpers
  editor/       Tiptap v3 editor kit
  mail/ media/ storage/ export/ linkedin/ logger/ config/ utils/ testing/
```

## Stack

- **Stack:** TypeScript end to end, pnpm workspaces + Turborepo, tsdown builds, oxlint + oxfmt
- **Agents:** Vercel AI SDK. Each tool is defined once and adapted for chat, workflows, and MCP.
- **Workflows:** a hand-written interpreter over a JSON graph. No user code runs. Users compose a closed catalog of nodes.
- **Tests:** API integration tests against a real Postgres and Redis ([apps/api/test](../apps/api/test/README.md))
