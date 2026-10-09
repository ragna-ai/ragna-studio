# Product overview

Reference doc, not a PRD: no `Status:` line (see [README.md](./README.md)).
What ragna-studio actually does, grouped by product area, for fast
context-loading at the start of a session. Each entry is what the feature
does, not how it was built, with a link to its PRD for the how/why/schema.
For build status across all docs (proposed/in-progress/implemented/etc),
see [INDEX.md](./INDEX.md) instead, that's the generated, exhaustive list.

Keep this doc in sync by hand: when a PRD's Status flips to `implemented`,
add or update its entry here.

## Core platform

### Workspaces

Every resource (chats, documents, datasets, tasks, media, agents) belongs
to exactly one workspace. The workspace is the container and the
permission boundary, there's no separate "board" or "project" entity
layered on top.
→ [specs/api-standards/prd.md](./api-standards/prd.md)

### Organizations

Every user gets a personal organization at sign-up. Organizations own
workspaces and credit accounts. Members reach all workspaces of their
organization. The owner and admins invite members by email, manage roles and
remove members in the org settings. The owner can delete the organization,
which is restorable for 30 days.
→ [specs/organizations/prd.md](./organizations/prd.md), [v2](./organizations/v2-prd.md)

### Auth

better-auth with a Drizzle adapter, Google OAuth, and an admin plugin.
No dedicated PRD, it's foundational infrastructure rather than a product
feature.

### Credits

Usage-based credit ledger for metered AI operations (chat, imagegen,
videogen). Implemented but inert in practice: waiting on pricing data to
be seeded and the `CREDITS_ENABLED` flag.
→ [specs/credits/prd.md](./credits/prd.md)

## Chat & agents

### Chat

Core conversational interface with AI agents. Predates the PRD process,
so there's no single spec doc; the closest reference is the message
persistence design.
→ [specs/chat/chat-message-persistence.md](./chat/chat-message-persistence.md)

### Chat branching

Split a conversation into a new chat at any message, preserving history
up to that point. Reachable via a hover-revealed menu on each message.
→ [specs/chat/branching.md](./chat/branching.md)

### Agent context & memory

Agents can be given free-text context, read attached documents, and (past
a size threshold) search prior context via pgvector retrieval. Separately,
agents have persistent memory and configurable default settings.
→ [specs/agent/agent-context.md](./agent/agent-context.md),
[agent-context-documents.md](./agent/agent-context-documents.md),
[agent-context-retrieval.md](./agent/agent-context-retrieval.md),
[agent-memory.md](./agent/agent-memory.md),
[agent-default-and-settings.md](./agent/agent-default-and-settings.md)

### Live team chat

Realtime, WebSocket-based chat between human team members (distinct from
the AI chat above). Phase 1 (direct messaging) shipped; the multi-room
engine is a later phase.
→ [specs/team-chat/prd.md](./team-chat/prd.md)

### Notifications

In-app bell notifications, currently delivered by polling. A WebSocket
push upgrade is proposed but not built.
→ [specs/notifications/notifications.md](./notifications/notifications.md)

## Automation

### Workflows

A visual, node-based automation builder (own interpreter, not a
third-party framework like Mastra). Supports scheduled triggers and a
"team" node that delegates a step to another agent.
→ [specs/workflow/workflows.md](./workflow/workflows.md),
[workflows-scheduling.md](./workflow/workflows-scheduling.md),
[workflows-team-node.md](./workflow/workflows-team-node.md)

### Tasks / Kanban board

Linear-style kanban board, one per workspace. Humans manage it via
drag-and-drop; agents get CRUD tools and can be assigned to tasks
(assignment is metadata only, no autonomous execution yet).
→ [specs/tasks/prd.md](./tasks/prd.md)

## Content & generation

### Documents

Markdown documents edited with the `@repo/editor` Tiptap kit, shared
between humans and agents within a workspace.
→ [specs/documents/prd.md](./documents/prd.md)

### Datasets

Structured, spreadsheet-like state shared between humans and agents,
supporting concurrent agent writes, manual row reordering, and export.
→ [specs/datasets/datasets.md](./datasets/datasets.md)

### Media library

Central store for generated and uploaded images, videos, and documents,
shared across chat attachments, image generation, and video generation.
→ [specs/media-library/prd.md](./media-library/prd.md),
[unified-media-prd.md](./media-library/unified-media-prd.md)

### Image generation

Text-to-image generation with advanced provider inputs, run as
pending-row background jobs through the worker.
→ [specs/imagegen/prd.md](./imagegen/prd.md),
[worker-execution-prd.md](./imagegen/worker-execution-prd.md)

### Video generation

Text-to-video via BFL FLUX 3, with draft and enhance modes.
→ [specs/videogen/prd-v2.md](./videogen/prd-v2.md)

### AI content labeling

Automatically tags AI-generated media with a provenance badge, best-effort
(doesn't block generation if labeling fails).
→ [specs/ai-labeling/prd.md](./ai-labeling/prd.md)

### Email client

Gmail-backed email client (`/mail`): three-pane UI, AI auto-categorization
into user-defined categories, AI reply drafts via a configurable agent
(auto-triggered per category/sender or manual), markdown-canonical content
pipeline rendered through `@repo/editor`. Polling sync with manual
"Sync now".
→ [specs/email/prd.md](./email/prd.md),
[gmail-client-decision.md](./email/gmail-client-decision.md)

## Supporting services

### Web browser service

Standalone scraping/browser-automation service (`apps/webbrowser`, port
3011). SSRF hardening deferred since it's internal-only for now.
→ [specs/webbrowser/prd.md](./webbrowser/prd.md)
