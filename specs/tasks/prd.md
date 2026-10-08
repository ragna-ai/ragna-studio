# Tasks / Kanban Board (PRD)

> **Status: implemented** (2026-07-21, verified and approved by the user).
> Notable deviations from spec during the build: the detail-page labels
> field is a dropdown checkbox picker (a shadcn tags-input variant was
> tried and reverted); board cards show subtask progress via a dedicated
> `subtaskDoneCount` aggregate; the task PATCH returns a bare row (no
> joined labels/assignee), so the web merges responses into the query
> cache and refetches only for label/assignee changes.

A Linear-style kanban board for planning tasks. Workspace-scoped per the
container model ([specs/api-standards/prd.md](../api-standards/prd.md)).
Humans manage the board in the web app. Agents manage tasks via chat tools
and can be assigned to tasks.

## Decisions

Settled 2026-07-21. Do not re-open.

| Decision        | Choice                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Columns**     | Fixed Linear-style statuses: Backlog, Todo, In Progress, In Review, Done, Canceled. Enum, no columns table.    |
| **Boards**      | One board per workspace. The workspace *is* the board. No board entity.                             |
| **Agent role**  | CRUD tools in chat, plus tasks are assignable to agents (`assignedAgentId`). Assignment is metadata only in v1; autonomous execution is a later phase. |
| **V1 fields**   | Due date, labels (workspace-scoped, colored, many-to-many), subtasks (one level), markdown description edited via `@repo/editor`. |
| **Reminders**   | Due-date relative: "remind me X days before due" stored as an offset (`remindDaysBeforeDue`), delivered through the existing notification system (worker cron → `NOTIFY_USER_JOB` → bell). Fires once; moving the due date moves the reminder; recipient is the workspace owner. |

## Goals (v1)

- A task lives in exactly one workspace and one status column.
- Humans create, edit, move (drag-and-drop), and delete tasks on a board page.
- Agents list, read, create, update, and move tasks via tools. Agents cannot delete.
- Tasks can be assigned to an agent (shown on the card, no side effects yet).
- Labels are workspace-scoped, managed by humans, attachable by both.
- Subtasks: one level deep. A subtask cannot have subtasks of its own.
- Task description is markdown, edited with the `@repo/editor` Tiptap kit,
  same canonical-format rule as documents.
- A task with a due date can have a reminder: "remind me X days before due"
  (0 = on the due date). The workspace owner gets an in-app notification
  via the existing bell.

## Non-goals (v1)

- Autonomous execution of assigned tasks (worker/queue integration). Later phase.
- Custom columns or multiple boards/projects per workspace.
- User assignees (needs multi-user workspaces first). `assignedAgentId` only.
- Comments, activity log, realtime board updates.
- Done/Canceled column archiving or capping. Board returns everything in v1.
- Agent-managed labels (create/rename/delete). Agents only attach existing ones.

## Schema

### `task` (table `tasks`)

| Column             | Type      | Notes                                                                 |
| ------------------ | --------- | --------------------------------------------------------------------- |
| `id`               | text      | `primaryIdColumn`                                                     |
| `workspaceId`      | text      | FK → `workspace.id`, cascade, indexed                                 |
| `number`           | integer   | per-workspace sequence, displayed as `TSK-<number>`; unique `(workspaceId, number)` |
| `title`            | text      | not null                                                              |
| `description`      | text      | markdown, not null, default `''`                                      |
| `status`           | text enum | `backlog` \| `todo` \| `in_progress` \| `in_review` \| `done` \| `canceled`, default `todo` |
| `priority`         | text enum | `none` \| `urgent` \| `high` \| `medium` \| `low`, default `none`     |
| `sortOrder`        | text      | fractional-index rank within the status column, not null              |
| `dueDate`          | timestamp | nullable                                                              |
| `remindDaysBeforeDue` | integer | nullable; reminder fires `dueDate - N days`, `0` = on the due date; meaningless without `dueDate` |
| `reminderSentAt`   | timestamp | nullable; stamped by the cron so a reminder fires exactly once        |
| `parentTaskId`     | text      | nullable self-FK → `task.id`, `set null` on delete (subtasks survive as top-level tasks) |
| `assignedAgentId`  | text      | nullable FK → `agent.id`, `set null` on delete                        |
| `createdByUserId`  | text      | nullable FK → `user.id`, `set null`                                   |
| `createdByAgentId` | text      | nullable FK → `agent.id`, `set null`                                  |
| timestamps         |           | `...timestamps`                                                       |

- Authorship follows the document pattern: exactly one of `createdByUserId` /
  `createdByAgentId` is set.
- The self-FK needs the Drizzle `AnyPgColumn` return-type annotation to avoid
  a circular type error.
- `number` is computed in the service as `max(number) + 1` per workspace,
  inside a transaction. Good enough for a showcase app; no sequence table.
- One-level subtask rule is enforced in the service: a task with a
  `parentTaskId` is rejected as a parent.

### `taskLabel` (table `task_labels`)

| Column        | Type | Notes                                        |
| ------------- | ---- | -------------------------------------------- |
| `id`          | text | `primaryIdColumn`                            |
| `workspaceId` | text | FK → `workspace.id`, cascade, indexed        |
| `name`        | text | not null, unique `(workspaceId, name)`       |
| `color`       | text | not null, hex string                         |
| timestamps    |      | `...timestamps`                              |

### `taskToTaskLabel` (table `tasks_to_task_labels`)

| Column        | Type | Notes                                   |
| ------------- | ---- | --------------------------------------- |
| `taskId`      | text | FK → `task.id`, cascade                 |
| `taskLabelId` | text | FK → `task_labels.id`, cascade          |

Composite primary key `(taskId, taskLabelId)`.

All three tables must be registered in
`packages/database/src/schema/relations.ts` (schema object plus FK
relations), not just exported from `schema/index.ts`.

## Ordering: fractional indexing

`sortOrder` uses the `fractional-indexing` npm package (tiny, no deps).
Moving a card generates a new key between its neighbors, so a move touches
exactly one row. The **server** computes ranks: move requests name neighbor
tasks, never raw rank strings. This keeps web drag-and-drop and agent moves
on the same code path and avoids trusting client-generated keys.

## API (apps/api)

Per the api-standards PRD: nested routes, workspace guard, thin controller,
`services/task.service.ts`, `src/validation/task.schema.ts`, standard
envelope.

```
/workspace/:workspaceId/task                    GET list, POST create
/workspace/:workspaceId/task/:taskId            GET, PATCH, DELETE
/workspace/:workspaceId/task/:taskId/move       POST custom action
/workspace/:workspaceId/task-label              GET list, POST create
/workspace/:workspaceId/task-label/:taskLabelId PATCH, DELETE
```

- **List**: returns all tasks in the workspace with labels, assigned agent
  name, and subtask counts. Not paginated; a board needs every card
  (stated in the route doc comment per the pagination standard). Optional
  query filters: `status`, `priority`, `taskLabelId`.
- **Create**: title required; status, priority, description, dueDate,
  remindDaysBeforeDue, parentTaskId, assignedAgentId, labelIds optional.
  `remindDaysBeforeDue` without a `dueDate` is rejected with `400`. Server assigns `number`
  and appends to the bottom of the target column.
- **PATCH**: partial update of title, description, priority, dueDate,
  remindDaysBeforeDue, parentTaskId, assignedAgentId, labelIds. Not
  status/sortOrder; moving is a dedicated action. Changing `dueDate` or
  `remindDaysBeforeDue` clears `reminderSentAt`, so a rescheduled reminder
  re-arms. Clearing `dueDate` also clears the reminder fields.
- **Move**: `POST /task/:taskId/move` with `{ status, afterTaskId? }`.
  Omitted `afterTaskId` means top of the column. Server computes the new
  `sortOrder`. One atomic call per drag.
- **Delete**: deleting a parent leaves its subtasks as top-level tasks
  (`set null`).
- **Labels**: create/rename/recolor/delete. Label delete cascades the join
  rows only, never touches tasks.

## Reminders

Reminders ride on the existing notification pipeline
([specs/notifications/notifications.md](../notifications/notifications.md)).
The reminder is stored as an **offset from the due date**
(`remindDaysBeforeDue`), never as a precomputed absolute timestamp: when
the due date moves, the reminder moves with it for free. The fire time is
derived in the cron query as `dueDate - N days`. A reminder therefore
requires a due date.

- **Notification kind** (the documented three steps, no schema change):
  `task_reminder_due` in `NotificationDataMap` (`@repo/queue`) with payload
  `{ taskId, workspaceId, taskNumber, taskTitle }`; a presenter in
  `apps/web` mapping it to i18n keys and a link to the task detail page
  (`/tasks/:taskId`); the emit site is a new worker cron.
- **Cron** (`apps/worker/src/crons/task-reminder.cron.ts`, registered in
  `crons/index.ts`): runs every minute. Selects tasks where `dueDate` and
  `remindDaysBeforeDue` are set,
  `dueDate - make_interval(days => remindDaysBeforeDue) <= now`
  (a `sql` fragment in the repo query), `reminderSentAt is null`, and
  status is not `done` / `canceled`. For each, enqueues `NOTIFY_USER_JOB`
  with the workspace owner as `userId` (joined via the task's workspace),
  then stamps `reminderSentAt`. Best-effort per task: one failure never
  blocks the rest.
- **Fire-once and re-arm semantics**: `reminderSentAt` is the guard. PATCH
  clears it when `dueDate` or `remindDaysBeforeDue` changes, so pushing a
  due date out re-arms the reminder. Completing or canceling a task before
  the reminder fires suppresses it (the cron's status filter). If a due
  date is set to the past or the offset lands in the past, the reminder
  fires on the next cron tick once; that is accepted.
- **Recipient**: the workspace owner, matching the current access model.
  When multi-user workspaces land, this becomes assignee/members.
- Delivery latency is cron interval + the 30s bell polling. Fine for task
  reminders; no push channel in v1.

## Agent tools

New file `packages/ai/src/tools/task.tools.ts`, following
`document.tools.ts`:

- Workspace-scoped factory: tools receive `workspaceId`, every call is
  scoped to it. Tool-created tasks inherit the chat's workspace.
- Flat `z.object` input schemas only (no top-level unions).
- Registered as a `tasks` toolset (agent tools enum + web form toggles).

| Tool         | Behavior                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| `listTasks`  | All tasks: `TSK-<number>`, id, title, status, priority, dueDate, labels, parent, assignee. Optional status filter. |
| `readTask`   | Full task by id, including markdown description and subtasks.             |
| `createTask` | Title plus optional description, status, priority, dueDate, remindDaysBeforeDue, parentTaskId, label names. Sets `createdByAgentId`. |
| `updateTask` | Partial update of the same fields, plus assign/unassign an agent. Due-date/offset changes re-arm the reminder like PATCH. |
| `moveTask`   | Target status plus position `top` \| `bottom`. Wraps the move service.    |

No delete tool for agents; the Canceled status covers abandonment. Tools
call the task service directly (same process), not the HTTP API.

## Web app (apps/web)

- **Tasks page** (`/tasks`): one page, two views, Linear-style switcher
  (board / list) in the toolbar next to the filter bar. The chosen view is
  persisted in localStorage. Filters (status, priority, label) and the
  data queries are shared: switching views never refetches differently.
  Calendar is a later third view; the switcher is built as an extensible
  segmented control, not a boolean toggle.
- **Board view**: six fixed status columns. Drag-and-drop via
  `vue-draggable-plus`, optimistic move with rollback, query invalidation
  on settle. Card shows `TSK-<number>`, title, priority icon, labels,
  due date (overdue styling), assigned agent, and subtask progress
  (`2/5`) on parents.
- **List view**: a table grouped by status (Linear-style section headers
  with counts), rows ordered by the same `sortOrder`. Columns:
  `TSK-<number>`, title, priority, labels, due date, assignee. Row click
  navigates to the task detail page. No drag-and-drop in the list in v1;
  reordering and status changes happen on the board or the detail page.
- **Task detail page** (`/tasks/:taskId`): a full page like the document
  editor, Linear-style. **Not** a sheet, dialog, or popup. Clicking a card
  navigates to it; back returns to the board. Layout: main column with
  inline-editable title, the markdown description in an `@repo/editor`
  instance (parse on load, serialize on save, debounced autosave, document
  pattern), and the subtask list with quick-add; a right properties
  sidebar, Linear-style: status, priority, due date, assignee, labels, and
  the reminder select ("Remind me: on due date / 1 day before /
  2 days before / 1 week before / custom N days / off", writing
  `remindDaysBeforeDue`, enabled only when a due date is set).
  Respect the `@repo/editor` type boundary: no `.chain()` calls in
  `apps/web`, only the package's typed command functions.
- **Labels**: manage dialog (create, rename, recolor, delete) reachable
  from the board's filter bar.
- **Composables**: `useTaskApi.ts` and `useTaskLabelApi.ts` per the
  `useDocumentApi` pattern; active workspace via `useActiveWorkspaceId()`,
  never as a parameter.
- Agent changes appear after reload/refetch. No realtime in v1.

## Later (explicitly deferred)

- **Autonomous execution**: assigning an agent enqueues a worker job, the
  agent works the task and reports back by moving it and commenting.
  Needs its own PRD (run model, status reporting, guardrails).
- User assignees, once multi-user workspaces land.
- Custom columns, multiple boards/projects per workspace.
- Calendar view (third entry in the view switcher, plotting tasks by due
  date). List-view drag-and-drop reordering.
- Comments and activity log on tasks.
- Realtime board sync (websocket channel scoping).
- Done/Canceled archiving once boards grow.
- Recurring reminders and email/push reminder channels (the notification
  processor is the documented fan-out point when they come).
- Absolute-time reminders on tasks without a due date, and finer-than-day
  offsets ("2 hours before").
- Overdue-task digests ("3 tasks are overdue"); v1 only styles overdue
  cards on the board.
