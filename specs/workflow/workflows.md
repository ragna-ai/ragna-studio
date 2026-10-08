# Workflows

**Status: implemented.**

Client-configurable workflows, stored in the database, edited on a visual canvas, executed by the worker.

## Decision: no Mastra, own interpreter

Workflows here are data-driven: a JSON graph that a client edits in a canvas. Mastra workflows are code-first (`createStep()` / `createWorkflow()` in TypeScript, committed at build time). Building on Mastra would mean writing a JSON-to-Mastra compiler anyway, plus inheriting parts we don't want:

- Mastra brings its own storage layer and agent/model abstractions. That duplicates `@repo/ai` (Vercel AI SDK), the `agents` table, and Drizzle.
- Its execution runtime overlaps with the BullMQ worker. Queueing, retries, and cron would still be wired by hand.
- What Mastra actually buys (suspend/resume, per-step persistence) is a few hundred lines when the node catalog is small and closed.

The key simplification: clients do not write arbitrary code. They compose a fixed catalog of node types we define. An interpreter over a DAG of known node types is small. The Vercel AI SDK does the hard part (LLM calls, tool calls, streaming).

Revisit Mastra only if we later need multi-day durable runs or find ourselves rebuilding per-node retries-with-state. Nothing in this design blocks that: the JSON definition could be compiled to Mastra steps behind the same tables and API.

## Shared package: `@repo/workflow`

One source of truth for types and validation, used by web, api, and worker:

- Node type definitions, each with a Zod config schema.
- The workflow definition type (vue-flow-shaped `nodes[]` / `edges[]`).
- Run and step status enums.

Web renders node config forms from the Zod schemas (VeeValidate) and validates before save. Worker validates the definition again before execution.

## Node catalog (v1)

| Node type   | Config                                                              |
| ----------- | ------------------------------------------------------------------- |
| `trigger`   | Manual or cron (see [workflows-scheduling.md](./workflows-scheduling.md)). Webhook later. |
| `agent`     | References an `agents` row, or inline model + prompt. Runs via `@repo/ai`. |
| `tool`      | One of the existing tools: think, webSearch, webBrowser, imageGen.  |
| `condition` | Branch on an expression or an LLM classification.                   |
| `transform` | Template string or field mapping between nodes.                     |

Later: `approval` (suspends the run until a user acts), specified in [workflows-human-in-the-loop.md](./workflows-human-in-the-loop.md).

## Schema

Three tables in `packages/database/src/schema/`:

**`workflows`**

| Column                 | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `id`, `user_id`        | Ownership.                                          |
| `name`, `description`  | Display.                                            |
| `definition`           | Draft graph as JSON, in vue-flow's native shape.    |
| `published_definition` | Snapshot used for execution. Null until published.  |

The graph is stored exactly as the canvas produces it: `nodes[]` with position and typed `data`, plus `edges[]`. No translation layer between canvas and DB.

**`workflow_runs`**

| Column                       | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `id`, `workflow_id`          | Identity.                                                |
| `status`                     | `pending` / `running` / `suspended` / `completed` / `failed`. |
| `definition`                 | Snapshot of the published definition at enqueue time. Makes runs debuggable after later edits. |
| `input`, `output`, `error`   | Run payloads as plain text. Output is the terminal node's output (JSON object keyed by node id when there are several terminals). |
| `started_at`, `finished_at`  | Timing.                                                  |

**`workflow_run_steps`**

| Column                      | Purpose                              |
| --------------------------- | ------------------------------------ |
| `run_id`, `node_id`         | Which node of which run.             |
| `status`                    | Same enum as runs.                   |
| `input`, `output`, `error`  | Per-node payloads as plain text. `input` is the node's resolved `{{input}}` value (the upstream output, or the run input for trigger-fed nodes). |
| `started_at`, `finished_at` | Timing.                              |

Step rows serve two purposes: live run visualization on the canvas, and cheap resume. On retry or resume, nodes with a completed step row are skipped.

## Execution

Follows the existing queue/worker pattern, one BullMQ job per run:

1. `WORKFLOWS_QUEUE` constant in `@repo/queue/src/constants/`.
2. `StartWorkflowRun` DTO in `@repo/queue/src/dtos/`.
3. `workflow.processor.ts` in `apps/worker/src/processors/`, registered in `index.ts`.

The processor loads the run's definition snapshot, topologically walks the DAG, and executes each node through a `nodeExecutors` map keyed by node type. Each node writes a `workflow_run_steps` row.

Properties that fall out of this:

- **Retries are idempotent.** BullMQ retries the run job; completed steps are skipped.
- **Suspend/resume is a status.** A suspending node marks the run `suspended` and returns. Resuming enqueues a new job that picks up where the step rows end.
- **Scaling path.** If runs get very long, switch to one job per node. The data model does not change.

## API (`apps/api`)

- CRUD controller for workflows (save draft, publish).
- `POST /workflows/:id/runs` validates the published definition and enqueues a run.
- `GET /runs/:id` returns run and step statuses (polling first, SSE if needed).

## UI (`apps/web`)

Built on the ai-elements-vue workflow canvas, a thin wrapper over Vue Flow. Its nodes/edges model matches the stored `definition` 1:1.

- **Editor page**: node palette, canvas, side panel with a schema-driven config form for the selected node. Save serializes the canvas state straight into `definition`.
- **Run page**: same canvas in read-only mode, nodes colored by step status from the run endpoint.

## Open points

- ~~Trigger scope for v1~~: resolved 2026-07-14. v1 shipped manual-only; scheduled (cron) triggers are specified in [workflows-scheduling.md](./workflows-scheduling.md).
- Versioning beyond draft/published. Per-run definition snapshots cover debugging; full version history can come later if clients need rollback.
- Stale-run sweeper cron (deferred 2026-07-13): a worker cron that marks runs stuck in `pending`/`running` beyond a timeout as `failed`. Fail-fast enqueue handling, job retries, and manual cancel are implemented. Bundled into the scheduled-triggers scope (see [workflows-scheduling.md](./workflows-scheduling.md)), since unattended scheduled runs make it necessary.
- Agent skills (idea, not confirmed): reusable instruction blocks a user attaches to agents (agent-level, statically appended to the system prompt). Would flow into workflow agent nodes for free since the executor resolves the agent row at run time. Discussed 2026-07-13, scope not yet decided.
