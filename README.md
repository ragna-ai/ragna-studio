<div align="center">

<!-- TODO: logo -->

# RAGNA Studio

#### The self-hosted AI workspace where agents are your co-workers.

[![GitHub release](https://img.shields.io/github/v/release/ragna-ai/ragna-studio?style=flat&logo=github)](https://github.com/ragna-ai/ragna-studio/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/ragna-ai/ragna-studio/ci.yml?branch=main&style=flat&logo=githubactions&logoColor=white&label=CI)](https://github.com/ragna-ai/ragna-studio/actions/workflows/ci.yml)
[![Docker images](https://img.shields.io/badge/docker-ghcr.io-2496ED?style=flat&logo=docker&logoColor=white)](https://github.com/orgs/ragna-ai/packages?repo_name=ragna-studio)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat)](LICENSE)
[![No telemetry](https://img.shields.io/badge/telemetry-none-brightgreen?style=flat)](#privacy)

Your agents read your documents and keep their state in datasets.<br />
They delegate to each other and run on a schedule while you sleep.<br />
You host it. You own the data. You bring your own model keys, or run local models.

[**Quickstart**](#quickstart) &nbsp;&bull;&nbsp; [Self-hosting](docs/self-hosting.md) &nbsp;&bull;&nbsp; [Features](docs/features.md) &nbsp;&bull;&nbsp; [Contributing](CONTRIBUTING.md)

<br />

<!-- TODO: hero GIF: an agent filling dataset rows while the grid is open -->

</div>

## Quickstart

```bash
cp .env.example .env          # fill in secrets, storage, one OAuth provider, and one AI key
make up-dev-full              # pulls the images and starts the whole stack
```

Open [localhost:3000](http://localhost:3000) and sign in with Google or Microsoft.
See [self-hosting](docs/self-hosting.md) for requirements and optional providers.

## Agents with their own expertise

Every resource lives in a workspace: agents, datasets, documents, tasks, chats, workflows, and media.
Create one for sales, one for content, one for the back office. Agents only see the workspace they run in.

Each agent is a specialist. It has its own instructions, model, and tools. It learns from the documents you give it, and switches to retrieval on its own when the knowledge base grows large. It also keeps a memory that it writes itself and carries into every later chat.

<!-- TODO: screenshot: agent config with knowledge documents and tool toggles -->

## Datasets your agents work in

A dataset is a table with typed columns. You edit it in a grid. Agents read and write it through tools.

That makes a dataset a work queue, durable agent state, and a shared surface in one. A status column says what is todo, drafted, or done. Runs resume where the last one stopped. Every row records whether a user, an agent, or an outside app wrote it, and bad writes fail loudly against the column schema.

<!-- TODO: screenshot: dataset grid with agent-written rows and the row detail panel -->

## Teams that run on their own

Build workflows on a visual canvas and give them a cron schedule. A team node lets a lead agent delegate to up to five specialists in parallel. The lead reads their reports and re-delegates until the job is good enough.

Every run keeps a full trace: each decision, delegation, and tool call, with timing and token use. Failed runs retry and resume from the last completed step.

<!-- TODO: screenshot: run trace with an expanded delegation -->

## How it fits together

1. **Create a workspace** for one job, such as content or the back office.
2. **Set up expert agents** with instructions, knowledge, and the tools they need.
3. **Give them a dataset** as their work queue and memory.
4. **Put a team on a schedule.** A lead agent picks the next row and delegates.
5. **Review the output.** Rows, documents, and email drafts wait for you. Nothing is sent without you.

## Highlights

<table>
  <tr>
    <td width="40%" valign="middle">
      <h3>Email that drafts for you</h3>
      <p>Connect Gmail or Outlook. Mail is sorted into categories you define. An agent drafts replies from its own knowledge, and you review every one.</p>
    </td>
    <td width="60%">
      <!-- TODO: screenshot: mail view with an AI draft above the thread -->
    </td>
  </tr>
  <tr>
    <td width="40%" valign="middle">
      <h3>Image and video generation</h3>
      <p>FLUX, OpenAI, Imagen, and Veo. Jobs run in the background. An optional "AI generated" badge covers EU AI Act disclosure.</p>
    </td>
    <td width="60%">
      <!-- TODO: screenshot: media library with generated images and a video -->
    </td>
  </tr>
  <tr>
    <td width="40%" valign="middle">
      <h3>Documents and tasks</h3>
      <p>A rich-text editor and a Kanban board, shared by you and your agents. Agents create, update, and move tasks like any teammate.</p>
    </td>
    <td width="60%">
      <!-- TODO: screenshot: Kanban board with agent-created tasks -->
    </td>
  </tr>
  <tr>
    <td width="40%" valign="middle">
      <h3>MCP server</h3>
      <p>Add RAGNA as a connector in Claude Desktop and work with your datasets from there. Off by default, with per-resource access and every write logged.</p>
    </td>
    <td width="60%">
      <!-- TODO: screenshot: MCP settings page with the connector URL and access levels -->
    </td>
  </tr>
</table>

See [all features](docs/features.md).

## What you can build

**A back-office automation.** Connect the shared mailbox and define categories such as invoice, support, and order. An agent that knows your price list, contracts, and FAQ drafts the replies. You edit and send.

**A LinkedIn content pipeline.** You drop headlines into a Topics dataset. A scheduled team takes the next `todo` row. A researcher, a writer, and a designer produce a draft with images. The row moves to `drafted`, and you publish.

**A lightweight CRM.** A Leads dataset holds company, contact, stage, and next step. A nightly workflow researches new leads and moves the stage. A second agent drafts follow-ups for quiet leads.

## Supported providers

| Area | Providers |
| --- | --- |
| Chat and agents | Anthropic, OpenAI, Google (GenAI and Vertex), Mistral, LM Studio (local) |
| Embeddings | OpenAI |
| Images | FLUX (Black Forest Labs), OpenAI, Imagen |
| Video | FLUX 3 video, Veo |
| Web search | SerpAPI |
| Email | Gmail, Outlook |
| Sign-in | Google, Microsoft |
| Database | PostgreSQL 18 with pgvector |
| File storage | S3-compatible (configured for Cloudflare R2) |

## Privacy

RAGNA Studio sends no telemetry. Your data stays on your server.
It only reaches the services you configure, such as your LLM provider, storage, and mail account.

## Documentation

| Document | Start here when you need |
| --- | --- |
| [Self-hosting](docs/self-hosting.md) | Requirements, optional providers, and how the stack starts. |
| [Features](docs/features.md) | The full list of what ships in the box. |
| [Development](docs/development.md) | Running from source, local schema changes, and tests. |
| [Architecture](docs/architecture.md) | The system diagram, repository layout, and stack. |
| [Design docs](docs/README.md) | PRDs per feature area, with a generated [status index](docs/INDEX.md). |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. For larger changes, open an issue before you start.
Report security issues privately. See [SECURITY.md](SECURITY.md).

## License

Copyright (C) 2025-2026 Sven Stadhouders.

Licensed under the [AGPL v3.0](LICENSE).
