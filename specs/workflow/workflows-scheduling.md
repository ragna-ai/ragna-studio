# Workflows: scheduled triggers

**Status: implemented.**

Companion to [workflows.md](./workflows.md) (design) and [workflows-implementation.md](./workflows-implementation.md) (v1 contracts). This document specifies scheduled (cron) workflow triggers and resolves the "trigger scope" open point from workflows.md.

The core idea: a schedule is just another way to start a run. The engine, executors, and run/step tracking do not change. The only new machinery is a per-workflow BullMQ job scheduler whose tick creates a run row and enqueues the existing run job.

## Decisions

1. **Trigger config becomes a discriminated union on `kind`.**

   ```ts
   { kind: 'manual' }
   | { kind: 'schedule'; cron: string; timezone: string }
   ```

   `cron` is a 5-field cron expression (minute granularity, no seconds field). `timezone` is a required IANA name (e.g. `Europe/Berlin`); the UI defaults it to the browser timezone. Requiring it avoids server-local-time ambiguity. The definition lives in jsonb, so no migration is needed for the config change itself.

2. **A schedule is active only while published with a schedule trigger.** The active schedule always derives from `published_definition`. Transitions:
   - Publish with a schedule trigger: upsert the scheduler.
   - Publish with a manual trigger: remove the scheduler.
   - Delete the workflow: remove the scheduler.

   There is no unpublish endpoint, so these are the only transitions. Editing the draft never touches the scheduler.

3. **One BullMQ job scheduler per scheduled workflow, DB as source of truth.** The scheduler id is the workflow id, on a new `workflow-schedules-queue`. `upsertJobScheduler` is idempotent, so re-publishing just updates the pattern. The schedule is also denormalized into columns on `workflows` (see Database). Redis is treated as a cache of the DB state: worker startup reconciles the two (see Worker).

4. **The tick processor mirrors the manual run endpoint.** It creates a `workflow_runs` row (snapshot of `published_definition`, `triggered_by: 'schedule'`, `input: null`) and enqueues the existing `WorkflowRunJobDto` with `attempts: 3`. The engine is untouched. `{{input}}` resolves to `''` for trigger-fed nodes, same as a manual run without input.

5. **Overlap policy: skip.** If the workflow already has a run in `pending` or `running`, the tick logs and returns without creating a run. No stacking, no queueing of missed ticks.

6. **Tick jobs do not retry.** Tick job options: `attempts: 1`, `removeOnComplete: true`, `removeOnFail: { age: 24 * 3600 }`. A failed tick is covered by the next tick; retrying it could race the next occurrence.

7. **Runs record their origin.** New column `workflow_runs.triggered_by`: `'manual' | 'schedule'`, default `'manual'`.

8. **Self-healing over transactional coupling.** Publish writes the DB first, then syncs the scheduler. If the Redis sync fails (queues are `enableOfflineQueue: false`), the endpoint returns a 500 and the user retries publish, which is idempotent. Drift heals in both directions without manual intervention:
   - DB says scheduled, Redis lost it (flush, failed sync): worker startup reconciliation re-upserts it.
   - Redis has a scheduler with no matching DB schedule (cascaded user delete, failed publish): the tick guard removes it (see Worker).

9. **cron-parser joins zod as a dependency of `@repo/workflow`.** It is needed for shared cron validation (web form and API publish) and for computing next occurrences in the UI. This amends the v1 "only zod" constraint. BullMQ already uses cron-parser internally, so semantics match.

10. **Stale-run sweeper is bundled into this scope.** Scheduled runs execute unattended, so the deferred sweeper (workflows.md open points, 2026-07-13) becomes necessary: a worker cron marks runs stuck in `pending` beyond 1 hour or `running` beyond 2 hours as `failed`. Combined with the skip policy, this bounds how long a crashed run can block its schedule.

## Package: `@repo/workflow`

New exports:

```ts
// Trigger config (replaces the manual-only schema)
triggerConfigSchema; // z.discriminatedUnion('kind', [manual, schedule])
type TriggerConfig = { kind: 'manual' } | { kind: 'schedule'; cron: string; timezone: string };

// Cron helpers (cron-parser based)
isValidCronExpression(cron: string): boolean; // 5-field only
getNextCronOccurrences(cron: string, timezone: string, count: number): Date[];

// Schedule extraction, used by the API on publish and the worker on reconcile
getScheduleFromDefinition(def: WorkflowDefinition): { cron: string; timezone: string } | null;

// Run origin
WORKFLOW_RUN_TRIGGERS / WorkflowRunTrigger; // 'manual' | 'schedule'
```

The zod schema validates `cron` via `isValidCronExpression` and `timezone` via `Intl.supportedValuesOf('timeZone')` membership, so invalid schedules are rejected at save time in the web form and again at publish.

## Database (`packages/database`)

Schema changes (push directly, no hand-written migrations):

- `workflows`: new nullable text columns `schedule_cron` and `schedule_timezone`. Set on publish from the trigger config, cleared on publish with a manual trigger. They exist for reconciliation queries and list-view display; the trigger config in `published_definition` stays the semantic source.
- `workflow_runs`: new text column `triggered_by`, `$type<WorkflowRunTrigger>()`, not null, default `'manual'`.

Repository changes:

- `publishWorkflow` also writes `schedule_cron` / `schedule_timezone` (passed in by the API, derived via `getScheduleFromDefinition`).
- `createWorkflowRun` accepts `triggeredBy`.
- New `getScheduledWorkflows()`: all workflows with `schedule_cron` not null (id, cron, timezone). Used by reconciliation.
- New `hasActiveRun({ workflowId })`: true when a run exists in `pending` or `running`. Used by the overlap guard.
- New `getWorkflowForScheduledRun({ workflowId })`: no userId check, returns the row incl. `published_definition` and schedule columns. Used by the tick processor.

## Queue (`packages/queue`)

- `WORKFLOW_SCHEDULES_QUEUE = 'workflow-schedules-queue'` in `src/constants/`.
- `src/dtos/workflow-schedule-tick-job.dto.ts`: `WORKFLOW_SCHEDULE_TICK_JOB = 'workflow-schedule-tick-job'` and `WorkflowScheduleTickJobDto { workflowId: string }`, existing class-with-`fromJSON`/`toJSON` style.
- New generic helpers in `bullmq.service.ts`, in the `queueAddJob` style (the existing `addCronJob` registry is static and startup-only, so it does not fit dynamic per-workflow schedules):

  ```ts
  upsertQueueJobScheduler({
    queueName,
    schedulerId,
    repeat: { pattern, tz },
    job: { name, data, opts },
  });
  removeQueueJobScheduler({ queueName, schedulerId });
  getQueueJobSchedulers({ queueName }); // for reconciliation
  ```

## Worker (`apps/worker`)

**Tick processor** (`src/processors/workflow-schedule.processor.ts`, registered in `processors/index.ts`), per tick:

1. Load the workflow via `getWorkflowForScheduledRun`.
2. **Orphan guard.** Workflow missing, or `schedule_cron` null: remove this job scheduler and return. This self-heals cascaded deletes and failed publishes.
3. **Run-as user.** `resolveScheduledRunUserId` returns the workflow author only while the author is active and can open the workflow's workspace. Otherwise the tick is skipped, no run is created and the scheduler stays. The schedule is paused and resumes once the author can run it again. There is no fallback to the org owner. List and get responses carry `schedulePaused`, and the web shows a "Schedule paused" badge.
4. **Overlap guard.** `hasActiveRun` true: log and return (decision 5).
5. Create the run row (`published_definition` snapshot, `triggered_by: 'schedule'`, `input: null`) and enqueue `WorkflowRunJobDto` with `attempts: 3`. If the enqueue throws, best-effort mark the run `failed`, mirroring the API's fail-fast enqueue handling.

**Startup reconciliation** (`src/workflow/reconcile-schedules.ts`, called from `src/index.ts` after processors are registered):

1. `getScheduledWorkflows()` from the DB.
2. `getQueueJobSchedulers` from Redis.
3. Upsert a scheduler for every DB row (idempotent, also fixes changed patterns).
4. Remove schedulers with no matching DB row.

**Stale-run sweeper** (`src/crons/stale-runs.cron.ts`, registered via the existing `addCronJob`): every 15 minutes, mark runs `failed` ("timed out") when `pending` with `created_at` older than 1 hour, or `running` with `started_at` older than 2 hours. Guarded so it never overwrites a terminal status.

## API (`apps/api`)

No new routes. Two routes change:

- `POST /workflow/:workflowId/publish`: after `publishWorkflow` succeeds, derive the schedule via `getScheduleFromDefinition` and sync: upsert the scheduler when present, remove it when absent. On sync failure, return a 500; publish is idempotent and retryable (decision 8). The schedule columns are passed into `publishWorkflow` so DB and definition update together.
- `DELETE /workflow/:workflowId`: best-effort `removeQueueJobScheduler` after the delete. A failure only logs; the tick orphan guard cleans up later.

## Web (`apps/web`)

- **Trigger config form**: a `kind` select (Manual / Schedule). Schedule mode shows a preset select (hourly, daily at time, weekly at day + time, custom cron), a raw cron input for the custom preset, and a timezone select defaulting to the browser timezone. Presets compile to cron; the form always stores `{ kind, cron, timezone }`.
- **Next-run preview** in the form: the next 3 occurrences via `getNextCronOccurrences`, rendered as localized datetimes. This doubles as human feedback for raw cron input (no cron-to-English library).
- **Workflow list**: a clock badge with the cron pattern for workflows with `schedule_cron` set.
- **Runs table and run view**: a `triggeredBy` badge (manual / scheduled).
- The existing draft/publish drift indicator already covers "schedule edited but not published"; no extra state needed.
- New strings go into both locales (`de-DE.json`, `en-UK.json`).

## Out of scope (deliberately)

- Per-user schedule quotas and minimum-interval limits beyond the 5-field (minute) granularity.
- Auto-disabling a schedule after N consecutive failures.
- Missed-tick catch-up (skip policy only).
- Webhook triggers (the `kind` union now makes them a pure addition).

## Proposed work split

Same pattern as v1: foundations first, then parallel.

| Agent          | Scope                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| A: foundations | `@repo/workflow` trigger union + cron helpers, DB columns + repo functions, queue constant + DTO + scheduler helpers |
| B: worker      | Tick processor, startup reconciliation, stale-run sweeper cron                                                       |
| C: api         | Publish/delete scheduler sync                                                                                        |
| D: web         | Trigger config form, badges, next-run preview, i18n                                                                  |
