# Notifications

**Status: implemented (delivery by polling).** Decision 4 (delivery by
polling) is superseded by `ws-push-prd.md` (WebSocket push, proposed
2026-07-23).

In-app notification system: a workflow run finishing (or any future event)
produces a persisted notification row that the web app surfaces in a nav bell
dropdown with an unread badge.

## Decisions

1. **Persistence, not just a queue job.** A notification must survive until read,
   so it lives in a `notifications` table. The BullMQ job is only the transport.
2. **Keep the notifications queue.** A producer enqueues `NOTIFY_USER_JOB` (via
   `queue.notification().add(...)` with a `NotifyUserJobDto`); the processor
   writes the DB row and is the single future fan-out point for email/push
   channels. Polling already tolerates ~30s latency, so the queue hop is
   invisible. (Notifications now hard-depend on Redis, which the worker and
   scheduler already require.)
3. **No new package.** Every piece has an existing home:
   - schema + repo functions → `@repo/database`
   - job constants + DTO → `@repo/queue`
   - registry (type → title/message) + row insert + fan-out → the worker processor
   - producer call → `workflow.processor.ts`
   - endpoints → `apps/api`
   - bell + dropdown → `apps/web`
4. **Delivery by polling.** TanStack Vue Query with `refetchInterval` on the
   unread-count query. No SSE/WebSocket; the emitter is the worker, the SSE
   connection would live in the API, and bridging them needs Redis pub/sub for
   no real gain at 30s. Structure leaves room to add SSE later.
5. **UI: nav bell + dropdown.** `NavTopBar.vue` already renders a static
   `BellIcon`. Wire it to unread count + a shadcn dropdown of recent items.
6. **Retention.** Prune read notifications older than 30 days via the existing
   `cleanup.cron.ts`.

## Data model

`packages/database/src/schema/notification.schema.ts`, a new `pgTable`
following `workflow.schema.ts` conventions (`primaryIdColumn`, `text`, `jsonb`,
`timestamp`, indexes). Do **not** spread `...timestamps` (no `updatedAt`/soft
delete needed); only `createdAt`.

```
notifications
  id         primaryIdColumn
  userId     text notNull references user.id onDelete cascade
  type       text notNull            -- notification kind, see catalog below
  data       jsonb null $type<Record<string, unknown>>()  -- event payload
  readAt     timestamp null          -- null = unread
  createdAt  timestamp defaultNow notNull
  index notifications_userId_idx        on (userId)
  index notifications_userId_readAt_idx on (userId, readAt)   -- unread-count / list
```

`export type Notification = typeof notification.$inferSelect;`
`export type NewNotification = typeof notification.$inferInsert;`

**The row stores only the event, never rendered copy.** Title, message and link
are _not_ columns: they are pure functions of `type` + `data` and are rendered on
read by the web presenter registry. This keeps rows tiny (no duplicated copy
across thousands of rows) and makes the text i18n-able (rendered in the user's
locale on read, not frozen in English at write time). `data` carries the machine
facts for the link plus any display params for interpolation (e.g. `workflowName`).

Register the new schema file in `packages/database/src/schema/index.ts` and add
its relation in `relations.ts` (`user` has many `notification`; `notification`
belongs to one `user`). Push the schema with `pnpm --filter @repo/database
db:push` (never hand-write SQL).

## Extensibility — adding a notification kind

The typed catalog of kinds lives in **one place**, `@repo/queue`:

```ts
export interface NotificationDataMap {
  workflow_run_succeeded: { workflowId: string; runId: string; workflowName: string };
  workflow_run_failed: { workflowId: string; runId: string; workflowName: string };
  // add new kinds here, each with its own payload shape (ids for the link,
  // names/counts for message interpolation)
}
export type NotificationType = keyof NotificationDataMap;
export type NotificationData<T extends NotificationType = NotificationType> =
  NotificationDataMap[T];
```

`NotifyUserJobDto` is generic over the kind, so `type` and `data` are checked as a
pair at the emit site. **Adding a kind is three steps, no migration:**

1. Add an entry to `NotificationDataMap` (`@repo/queue`).
2. Add a presenter in `apps/web/app/features/notification/presenters.ts` mapping
   the payload to i18n keys + params + link, and add the two strings to
   `en-UK.json` / `de-DE.json`.
3. Enqueue `NOTIFY_USER_JOB` at the event source (build a `NotifyUserJobDto` and
   `queue.notification().add(...)`).

The schema, repo, API, worker processor, and the DTO need **no changes** — they
carry `type` + `data` generically. Also mirror the new payload shape in the web's
local `NotificationDataMap` (`features/notification/types`), kept separate so the
browser bundle never imports the server queue package.

## Repository — `packages/database/src/repositories/notification.repo.ts`

Match `user.repo.ts` / `workflow-run.repo.ts` style (named async fns, `db` from
`../db`, drizzle-orm operators). Export from `repositories/index.ts`.

- `createNotification(payload: NewNotification): Promise<Notification>`
- `listNotifications({ userId, limit, offset }): Promise<Notification[]>`
  ordered by `createdAt desc`.
- `getUnreadNotificationCount({ userId }): Promise<number>`
  count where `readAt is null`.
- `markNotificationRead({ id, userId }): Promise<Notification | null>`
  set `readAt = now()` where `id` **and** `userId` match (ownership guard).
- `markAllNotificationsRead({ userId }): Promise<number>`
  set `readAt = now()` where `userId` and `readAt is null`; return affected count.
- `deleteReadNotificationsOlderThan({ date }): Promise<number>`
  delete where `readAt is not null and readAt < date`; return count (for cron).

## Queue — `@repo/queue`

- Constant `NOTIFICATIONS_QUEUE` already exists in `src/constants/index.ts`. Keep.
- `NotificationDataMap` in `src/constants/` is the single source of truth for the
  kinds and their payloads (see Extensibility). `NotificationType` and
  `NotificationData<T>` derive from it.
- `src/dtos/notify-user.dto.ts`: `NotifyUserJobDto<T>` is generic over the kind,
  payload `{ userId: string; type: T; data: NotificationData<T> }`. Keeps the
  `NOTIFY_USER_JOB` constant and `fromJSON`/`toJSON` shape. Producers enqueue with
  `queue.notification().add(NOTIFY_USER_JOB, new NotifyUserJobDto({...}).toJSON())`.

## Worker

### `apps/worker/src/processors/notification.processor.ts`

On `NOTIFY_USER_JOB`: parse the DTO and `createNotification({ userId, type, data })`.
No rendering — the row stores only the event. This is the documented future
fan-out point for email/push (those channels _would_ render server-side here).

### `apps/worker/src/processors/workflow.processor.ts` (emit point)

A `notifyRunFinished({ runId })` helper emits a notification whenever a run
reaches a terminal state, **regardless of trigger** (scheduled or manual). This
is the only place a run's outcome is observable; `workflow-schedule.processor.ts`
only dispatches the run and returns before it executes, so the emit cannot live
there. It enqueues the job inline:

```ts
await queue.notification().add(
  NOTIFY_USER_JOB,
  new NotifyUserJobDto({
    userId: run.workflow.userId,
    type,
    data: { workflowId: run.workflowId, runId: run.id, workflowName: run.workflow.name },
  }).toJSON(),
);
```

- `type` comes from `NOTIFICATION_TYPE_BY_RUN_STATUS[run.status]`: `completed →
  workflow_run_succeeded`, `failed → workflow_run_failed`, `cancelled →` none.
- `userId` is the workflow owner (`run.workflow.userId`, via `getRunForExecution`
  which joins the workflow).
- Called on **both** the success path and the final-attempt failure path.
- Best-effort: the whole helper is wrapped in try/catch + log so a notification
  failure never fails the run.

### `apps/worker/src/crons/cleanup.cron.ts` (retention)

Add a third step: `runCleanupStep('read notifications', () =>
deleteReadNotificationsOlderThan({ date: thirtyDaysAgo }))`.

## API — `apps/api/src/controllers/notification.controller.ts`

New Hono controller, `.basePath('/notification')`, `.use(authMiddleware)`,
scoped to `c.get('user')`. Mirror `user.controller.ts` / `workflow.controller.ts`
(use `tryCatch`, throw the app exceptions on failure). Register in `app.ts`
(`.route('/', notificationController)`).

- `GET /notification` — paginated list. Reuse `validPaginationQuery` middleware.
- `GET /notification/unread-count` — `{ count: number }`.
- `PATCH /notification/:id/read` — mark one read (ownership enforced by repo).
  Add an id-param validation middleware if the pattern requires one (see
  `validWorkflowIdParam`).
- `PATCH /notification/read-all` — mark all read, return `{ count }`.

Add any needed validators to `middlewares/validationMiddlewares.ts`.

## Web — `apps/web`

Follow the existing feature layout (`app/features/<feature>/composables` +
`components` + `types`), like `features/workflow`.

- `features/notification/composables/useNotificationApi.ts` — TanStack Vue Query,
  `useApi()` client, `notificationKeys` factory. Same shape as `useWorkflowApi.ts`.
  - `useUnreadCount()` — `useQuery` with `refetchInterval: 30_000`.
  - `useNotifications()` — list query, fetched when the dropdown opens
    (`enabled` on open, or fetch on mount).
  - `useMarkRead()` / `useMarkAllRead()` — `useMutation`, invalidate the
    unread-count + list keys on success.
- `features/notification/types/index.ts` — response types mirroring the API JSON,
  plus a local `NotificationDataMap` (see Extensibility).
- `features/notification/presenters.ts` — `presentNotification(n)` maps `type` +
  `data` to `{ titleKey, messageKey, params, to }` via a per-kind registry, with a
  fallback for unknown/removed kinds. Pure (no `t`); the component calls `t()`.
  This is where "render on read" happens.
- `NavTopBar.vue` — replace the static `<button><BellIcon/></button>` with a
  notification bell component: unread badge (dot/count) + shadcn `DropdownMenu`
  listing recent notifications. Each row renders `t(titleKey, params)` /
  `t(messageKey, params)` + relative time, navigates via the presenter's `to`
  (scenario-agnostic; no per-kind logic in the UI), and marks itself read on
  click. Header action: "Mark all read".
- Copy lives in `i18n/locales/en-UK.json` + `de-DE.json` under `notification.*`.
- Add shadcn components if missing (`npx shadcn-vue@latest add dropdown-menu`,
  etc.) from `apps/web/`.

## Sequence

```
run finishes, scheduled or manual (worker/workflow.processor)
  └─ queue.notification().add NOTIFY_USER_JOB { userId, type, data }
       └─ notification.processor: createNotification (row = type + data only)
web (polling, 30s)
  └─ GET /notification/unread-count → badge
  └─ open bell → GET /notification → list
       └─ presentNotification(row) → t(titleKey/messageKey, params) + link
  └─ click row → mark read + navigate (presenter `to`)
cron (daily) → prune read notifications > 30 days
```

## Out of scope (later)

- SSE/WebSocket push (structure supports adding it).
- Email/push channels (fan-out point exists in the processor).
- Per-type user preferences / mute settings.
