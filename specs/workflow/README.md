# Workflows: architecture overview

Entry point for the workflow feature docs. Read this first; it condenses the mechanics so the detail docs only need to be opened for specifics.

| Doc                                                                | Content                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [workflows.md](./workflows.md)                                     | Original design: no Mastra, node catalog, schema rationale.                                   |
| [workflows-implementation.md](./workflows-implementation.md)       | Binding v1 contracts: package exports, repos, engine behavior, API routes, web components.    |
| [workflows-scheduling.md](./workflows-scheduling.md)               | Scheduled (cron) triggers: job schedulers, tick processor, reconciliation, stale-run sweeper. |
| [workflows-human-in-the-loop.md](./workflows-human-in-the-loop.md) | PRD for the approval node (suspend/resume). Draft.                                            |
| [workflows-email-trigger.md](./workflows-email-trigger.md)         | PRD for the email trigger (provider-neutral, Gmail first, polling). Draft.                    |
| [workflows-team-node.md](./workflows-team-node.md)                 | Team node (lead agent delegating to 1-5 members) plus agent trace. Implemented.               |
| [workflows-known-issues.md](./workflows-known-issues.md)           | Resolved and open issues.                                                                     |

## What it is

Client-configurable workflows: a JSON DAG edited on a Vue Flow canvas, stored as-is in Postgres, executed by a hand-written interpreter in the worker. No Mastra, no user code. Users compose a closed catalog of node types.

## File map

| Area                                                           | Location                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Shared types, Zod configs, validation, cron helpers, templates | `packages/workflow/src/`                                                                                 |
| Workflow tool implementations (currently placeholder only)     | `packages/workflow/src/tools/`                                                                           |
| DB schema (3 tables)                                           | `packages/database/src/schema/workflow.schema.ts`                                                        |
| Repos                                                          | `packages/database/src/repositories/workflow.repo.ts`, `workflow-run.repo.ts`                            |
| Queue constants and job DTOs                                   | `packages/queue/src/constants/`, `src/dtos/workflow-run-job.dto.ts`, `workflow-schedule-tick-job.dto.ts` |
| Engine (DAG walk)                                              | `apps/worker/src/workflow/engine.ts`                                                                     |
| Node executors (one per type)                                  | `apps/worker/src/workflow/executors/`                                                                    |
| Run + schedule-tick processors                                 | `apps/worker/src/processors/workflow.processor.ts`, `workflow-schedule.processor.ts`                     |
| Schedule reconciliation, stale-run sweeper                     | `apps/worker/src/workflow/reconcile-schedules.ts`, `src/crons/stale-runs.cron.ts`                        |
| API controller (all routes under `/workflow`)                  | `apps/api/src/controllers/workflow.controller.ts`                                                        |
| Web feature module and pages                                   | `apps/web/app/features/workflow/`, `app/pages/workflow/`                                                 |

## Data model

- **`workflows`**: `definition` (draft graph, vue-flow shape) and `publishedDefinition` (execution snapshot, null until published). `scheduleCron` / `scheduleTimezone` are denormalized from the published trigger config.
- **`workflow_runs`**: per-run snapshot of the published definition, `status`, `triggeredBy` (`manual` | `schedule`), `input` / `output` / `error` as text.
- **`workflow_run_steps`**: one row per executed node, unique on (`run_id`, `node_id`). `toolCalls` jsonb is populated only by agent nodes running a referenced agent.

Statuses (`packages/workflow/src/status.ts`):

- Run: `pending | running | suspended | completed | failed | cancelled`. `suspended` is reserved for human-in-the-loop; nothing sets it yet.
- Step: `pending | running | completed | failed | skipped`. `skipped` = node on a not-taken condition branch.

## Node catalog

`trigger` (manual or cron), `agent` (referenced agent with full chat config and tools, or inline prompt without tools), `tool` (from `WORKFLOW_TOOLS`, currently only a placeholder entry), `condition` (safe comparator, no eval; branches via edge `sourceHandle: 'true' | 'false'`), `transform` (template).

Templates use a single placeholder `{{input}}`: the `\n\n`-joined outputs of the node's delivering upstream nodes, or the run input for trigger-fed nodes. Condition nodes are looked through when chaining, since their own output is just the branch token.

## Execution mechanics

One BullMQ job per run (`WORKFLOWS_QUEUE`, `attempts: 3`), processing the whole DAG in-process:

1. Engine loads the run, ignores terminal statuses (stale-retry guard), marks it `running`.
2. Pass loop over the node list until no progress. A node runs when all incoming edges are resolved and at least one delivers. Non-delivered nodes are marked `skipped`.
3. Before each node, a cheap status read catches mid-flight cancels.
4. Completed/skipped step rows from prior attempts are reused, so retries are idempotent and resume where they stopped.
5. Run output = terminal node output (JSON object keyed by node id when multiple terminals).

Failure model: a node failure marks only the **step** `failed` and rethrows. The run stays `running` so the BullMQ retry resumes it. The **processor** marks the run `failed`, and only on the job's final attempt (`attemptsMade + 1 >= attempts`). Completion and failure both enqueue a notification (`workflow_run_succeeded` / `workflow_run_failed`).

Cancel is a status, not a job kill: the endpoint sets `cancelled`, the engine stops before its next node.

## Scheduling mechanics

One BullMQ job scheduler per scheduled workflow (scheduler id = workflow id) on `workflow-schedules-queue`. DB is the source of truth, Redis a cache: publish syncs the scheduler, worker startup reconciles both directions, the tick processor removes orphans. Ticks skip when the workflow already has a `pending`/`running` run (overlap policy: skip, no catch-up). The stale-run sweeper cron fails runs stuck `pending` > 1h or `running` > 2h.

## Invariants worth remembering

- The run's `definition` snapshot, not the workflow row, drives execution and the run view.
- Publish validates structure (`validateWorkflowDefinition`); draft save validates shape only.
- Only condition nodes may use edge `sourceHandle` (enforced at publish).
- `@repo/workflow` depends only on `zod` + `cron-parser`; `@repo/database` depends on it for column typing.
- Workflow tool nodes do NOT use `@repo/ai`'s `tools()` factory; they have their own registry in `packages/workflow/src/tools/` (see known issues for why).
