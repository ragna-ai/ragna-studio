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

Every workspace has a visibility. A personal workspace belongs to one user
and nobody else opens it. An organization workspace is open to every org
member. A restricted workspace is open to its workspace members, plus org
owners and org admins. Workspace members are managers or editors. Managers
rename and delete the workspace and run its members.
→ [specs/api-standards/prd.md](./api-standards/prd.md), [specs/organizations/v3-prd.md](./organizations/v3-prd.md)

### Organizations

Every user gets a personal organization at sign-up. Organizations own
workspaces and credit accounts. Members reach all workspaces of their
organization. The owner and admins invite members by email, manage roles and
remove members in the org settings. The owner can delete the organization,
which is restorable for 30 days.
→ [specs/organizations/prd.md](./organizations/prd.md), [v2](./organizations/v2-prd.md)

### Navigation and settings

The app sidebar expands to labelled groups (Work, AI, Create) or collapses
to icons. The user menu holds the workspace switcher, the credit balance,
Settings, Help and sign out. All settings live in one settings area with its
own nav: account, organization, email and integrations, one address per
section.
→ [specs/settings/246-settings-area/prd.md](./settings/246-settings-area/prd.md)

### Auth

better-auth with a Drizzle adapter, Google OAuth, and an admin plugin.
Sign-in accounts are for sign-in only: one per provider, with the login
email, and no feature scopes. Feature tokens live in integration
connections (see Integrations).

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

### Chat search

Live, debounced search across a workspace's chats by title and message
content. Substring and case-insensitive. Results show Google-style snippets
per chat.
→ [specs/chat/search-prd.md](./chat/search-prd.md)

### Chat branching

Split a conversation into a new chat at any message, preserving history
up to that point. Reachable via a hover-revealed menu on each message.
→ [specs/chat/branching.md](./chat/branching.md)

### Agent selection

Every chat, email auto-draft and workflow node runs on an agent the user
picked; there is no default agent. A workspace without agents shows a
prompt in the chat with quick create from a template.
→ [specs/agent/remove-default-agent-prd.md](./agent/remove-default-agent-prd.md)

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

### Rich text editor

One shared editor for documents, task descriptions and the email composer. Markdown-only
feature set (CommonMark + GFM), Linear-style inline controls: bubble menu with a block type
dropdown, table menu, `/` command menu.
→ [specs/editor/prd.md](./editor/prd.md)

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

Text-to-image generation with FLUX 3, Gemini, and OpenAI, with advanced
provider inputs, run as pending-row background jobs through the worker.
→ [specs/imagegen/prd.md](./imagegen/prd.md),
[worker-execution-prd.md](./imagegen/worker-execution-prd.md),
[flux-3-prd.md](./imagegen/flux-3-prd.md)

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
(auto-triggered per category/sender or manual), Gmail-backed local-first
drafts, bulk trash of selected threads, and HTML content shown in a
sandboxed iframe (markdown only for the LLM). Polling sync with manual
"Sync now". Drafts run without agent tools (inbound mail is untrusted).
The mailbox uses its own integration connection. Disconnect and offboarding
revoke that connection at the provider.
→ [specs/email/prd.md](./email/prd.md),
[gmail-client-decision.md](./email/gmail-client-decision.md),
[drafts](./email/drafts-change-request.md),
[bulk trash](./email/mass-deletion-change-request.md),
[HTML content](./email/html-content-change-request.md),
[OAuth and MCP hardening](./security/oauth-mcp-hardening-prd.md)

## Integrations

### Integration connections

Feature credentials separate from sign-in. A user connects their own Google,
Microsoft or LinkedIn account per integration (mail, LinkedIn posting); the
scopes are requested at connect time and accumulate on one connection per
account. Tokens are encrypted with `APP_KEY` (`@repo/crypto`), refreshed under
a Postgres lock and never sent to the browser. Organization policy, shared
workspace connections and agent tools are later phases.
→ [prd.md](./integrations/224-connections/prd.md),
[design.md](./integrations/224-connections/design.md),
[slices.md](./integrations/224-connections/slices.md)

### MCP server

Remote MCP server in `apps/api` that lets Claude Desktop read and write
RAGNA Studio resources. Datasets are first, the tool layer is generic.
→ [specs/mcp/prd.md](./mcp/prd.md), [slices.md](./mcp/slices.md)

## Supporting services

### Web browser service

Standalone scraping/browser-automation service (`apps/webbrowser`, port
3011). SSRF hardening deferred since it's internal-only for now. Chromium is
closed after 5 min idle; `tini` reaps its orphaned helper processes.
→ [specs/webbrowser/prd.md](./webbrowser/prd.md),
[zombie-reaping-prd.md](./webbrowser/zombie-reaping-prd.md)
