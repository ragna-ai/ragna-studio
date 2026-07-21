# Home Overview (PRD)

> **Status: implemented** (2026-07-21, verified and approved by the user).
> Built as specced; spec-level changes made during the build are already
> folded into this document (flex-column layout instead of grid,
> `foreground/5` inner dividers, documents card added, backlog tasks
> excluded alongside canceled).

Overview cards on the home page (`pages/index.vue`). One card per section:
Tasks, Chats, Workflows, Agents. Each card shows the latest items of its
entity so the user gets a quick read of the workspace at a glance.
Workspace-scoped per the container model
([docs/api-standards/prd.md](../api-standards/prd.md)).

## Decisions

Settled in discussion on 2026-07-21.

| Decision          | Choice                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| **Data source**   | Reuse existing tables. No new tables, no activity/feed table, no join tables. The entities already carry `workspace_id` and `updated_at`. |
| **API shape**     | One aggregated endpoint: `GET /workspace/:workspaceId/overview`. Four parallel queries via `Promise.all`. One round trip, one loading state. |
| **Response**      | Per-section keys, not a homogenized union: `{ tasks, chats, workflows, agents }`, each `{ items, total }`. Adding a section later is one query, one key, one card. |
| **Item limit**    | 5 per section, sorted by `updatedAt` desc.                                                                |
| **DTOs**          | Slim projections, only what the card renders. Never full rows.                                            |
| **Caching**       | None in v1. `cache.service.ts` exists if it's ever measurably needed.                                     |
| **Indexes**       | Existing `workspace_id` indexes suffice at current scale. No composite `(workspace_id, updated_at)` index in v1. |
| **Canceled + backlog tasks** | Excluded from the tasks card entirely: filtered out of both `items` and `total`. Canceled is noise; backlog can be substantial and doesn't need attention (decided 2026-07-21). |
| **Card order**    | Tasks, Chats, Workflows, Agents (most action-oriented first).                                             |
| **Tasks grouping** | Display-only, client-side, same pattern as `TaskListView.vue`. API returns a flat recency-sorted list.   |

## Goals (v1)

- The home page shows five overview cards: Tasks, Chats, Workflows,
  Agents, Documents (Documents added 2026-07-21 after the first build).
- One request feeds all cards. Cards show skeletons while it loads.
- Each row links to its detail page. Each card header shows the total
  count and a "view all" link to the section's list/board page.
- Each card has an empty state with a "create" link.
- The pattern extends to later sections (documents, images, datasets)
  without breaking changes.

## Non-goals (v1)

- Activity feed or cross-entity timeline. This is "latest N per entity",
  not a merged event stream.
- Realtime updates. Data is fetched on page load.
- Per-card pagination or refresh.
- Draggable, resizable, or user-configurable cards (the inspiration
  mockup has drag handles; we don't). Fixed layout in v1.
- Images and datasets cards. Later.

## API

### `GET /workspace/:workspaceId/overview`

New `overview.controller.ts` (Hono, `authMiddleware` + `workspaceGuard`,
registered in `app.ts`) delegating to a new `overview.service.ts`.
The controller stays thin per
[docs/api-standards/prd.md](../api-standards/prd.md).

Response:

```jsonc
{
  "tasks": {
    "items": [
      { "id": "...", "number": 12, "title": "...", "status": "in_progress", "dueDate": null, "updatedAt": "..." }
    ],
    "total": 23
  },
  "chats": {
    "items": [
      { "id": "...", "title": "...", "agentName": "Research Agent", "updatedAt": "..." }
    ],
    "total": 41
  },
  "workflows": {
    "items": [
      { "id": "...", "name": "...", "lastRunStatus": "completed", "updatedAt": "..." }
    ],
    "total": 7
  },
  "agents": {
    "items": [
      { "id": "...", "name": "...", "description": "...", "modelName": "Claude Sonnet 5", "updatedAt": "..." }
    ],
    "total": 5
  },
  "documents": {
    "items": [
      { "id": "...", "title": "...", "updatedAt": "..." }
    ],
    "total": 12
  }
}
```

### DTO notes

| Section       | Fields                                                | Joins / notes                                                                 |
| ------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Tasks**     | `id`, `number`, `title`, `status`, `priority`, `dueDate`, `updatedAt` | No labels/assignee: skips the many-to-many join. `priority` is a scalar column and the web already has display helpers for it. Rendered as `TSK-<number>`. |
| **Chats**     | `id`, `title`, `agentName`, `updatedAt`               | Joins `agents` for the name. No message snippet (would need a `chat_messages` join per chat). |
| **Workflows** | `id`, `name`, `lastRunStatus`, `updatedAt`            | Latest run via relational query (`runs`, limit 1, `createdAt` desc). `lastRunStatus` is `null` when never run. |
| **Agents**    | `id`, `name`, `description`, `modelName`, `updatedAt` | Joins `ai_models` for the display name.                                        |
| **Documents** | `id`, `title`, `updatedAt`                            | No `content`, no folder/author joins. Title and recency are enough at overview granularity. |

`total` is a `count(*)` per entity per workspace, fetched in the same
`Promise.all`. The tasks query and count both exclude `canceled` and
`backlog` tasks.

### Service shape

`overview.service.ts` exports `getWorkspaceOverview(workspaceId)`. It owns
small `listRecentX(workspaceId, limit)` helpers instead of calling the
existing list functions, which carry pagination and filter machinery the
overview doesn't need. Helpers and interfaces live in the service file.

## Web (`apps/web`)

### UI design

Inspired by a ClickUp-style dashboard mockup (user-provided, 2026-07-21).
We take the card language and drop the widget mechanics: **no dragging,
no resizing, no expand or "..." card menus in v1.** Colors follow the
existing shadcn stone theme, not the mockup's palette.

- **Layout**: two independent flex columns on desktop (Tasks + Workflows
  left, Chats + Agents right), one stacked column on mobile. Flex instead
  of grid because cards differ in height: grid rows align tracks and
  leave a gap under the shorter card of each row.
- **Card shell**: header with a small icon chip, section title, and total
  count; a "view all" link on the right. Body is a divided row list.
  Footer is a ghost quick-create row ("+ New task" style) linking to the
  section's create flow. The same row doubles as the empty state.
- **Tasks card**: the latest 5 tasks, grouped client-side by status in
  the fixed `STATUS_COLUMNS` order with small "Status · count" headers,
  same presentational pattern as `TaskListView.vue`. The API still
  returns a flat recency-sorted list; grouping is display-only, and
  header counts are within-card counts (like the mockup), not workspace
  totals. Rows show `TSK-<number>`, title, priority icon, and due date
  with urgency coloring (red when today or overdue). Reuses the existing
  helpers in `features/task/lib/task-display.ts` (status labels,
  priority icons, `formatTaskDisplayId`, `isTaskOverdue`).
- **Chats card**: rows show chat title, agent name as muted meta, and
  relative updated time (`NuxtTime`).
- **Workflows card**: rows show a run-status dot (colored by
  `lastRunStatus`, gray when never run), workflow name, relative time.
- **Agents card**: styled like the mockup's "Projects" card. A 2-up tile
  grid instead of rows: colored icon tile, agent name, model name as
  meta line. Includes a dashed "create new agent" tile.
- **Documents card**: rows with document title and relative updated
  time. "View all" goes to `/document`, rows to
  `/document/<id>`. Sits at the bottom of the right flex column.
- **Borders**: inner row dividers and the quick-create footer border use
  `foreground/5` (`divide-foreground/5` / `border-foreground/5`) to stay
  subtle. Card outlines and agent tiles keep the theme `border` color
  for structure.

### Structure

New feature folder `app/features/home/`:

- `composables/useHomeOverview.ts`: single `useApiFetch` call against the
  overview endpoint, keyed by the active workspace id.
- `components/HomeOverview.vue`: the grid rendering the four cards.
- `components/HomeOverviewCard.vue`: generic card shell (icon, title,
  total count badge, "view all" link, skeleton state, quick-create /
  empty row) with a slot for section-specific content.
- Section content components per entity (task rows, chat rows, workflow
  rows, agent tiles).
- i18n keys under `home.overview.*` in both locales.

Placement on `pages/index.vue`: between `HomeQuickAccess` and
`HomeFavorites`. Open to change during review.

## Open questions

None. The former open questions (canceled tasks, card order) are settled
in the Decisions table above.
