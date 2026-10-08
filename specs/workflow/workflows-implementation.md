# Workflows: implementation plan

Companion to [workflows.md](./workflows.md) (the design). This document fixes the concrete contracts and records the work split used to implement v1. All interfaces below are binding: the worker, API, and web implementations were built in parallel against them.

## Decisions (v1 scope)

1. **No Mastra.** Own interpreter, see workflows.md.
2. **Trigger is manual-only.** The config keeps a `kind` discriminator so cron/webhook can be added without a schema migration. Scheduled (cron) triggers are specified in [workflows-scheduling.md](./workflows-scheduling.md).
3. **Condition node uses a safe comparator, not a free expression.** No expression parser, no eval. Config: `{ left, operator, right? }` where `left`/`right` are templates and operator is one of `equals | notEquals | contains | isEmpty | isNotEmpty`. Branching uses edge `sourceHandle: 'true' | 'false'`.
4. **Agent node runs a referenced agent with its full chat config.** When `agentId` is set, the node runs exactly like chat does: `generateText` with `tools`, `activeTools: agent.tools`, `stopWhen: stepCountIs(5)`, and `agent.settings` (temperature/maxOutputTokens). Inline nodes (no `agentId`) stay a plain `generateText` (system prompt + resolved prompt), no tool calls. Standalone tool calls are also their own node type that invokes the `@repo/ai` tool `execute` functions directly.
5. **Templates** use a single placeholder, `{{input}}`, meaning "this node's input": the joined output(s) of its direct upstream node(s) (`\n\n`-joined when there are several), or the run input for the node(s) fed directly by the trigger. A delivering condition node is looked through to its own delivering upstream outputs, since a condition's own output is just the `true`/`false` branch token. The engine computes this per node before execution; resolution lives in `@repo/workflow` so web and worker share it.
6. **Step statuses** are `pending | running | completed | failed | skipped`. Run statuses are `pending | running | suspended | completed | failed | cancelled`. `skipped` marks nodes on a condition branch that was not taken. `suspended` is reserved for the future `human-approval` node. `cancelled` is a run-only terminal status, set by the cancel endpoint (see below); steps have no cancelled state.
7. **Run output** is the output of the terminal node (no outgoing edges). Multiple terminals produce an object keyed by node id.
8. **Idempotent retries.** Before executing a node, the engine checks for an existing completed step row for that run and node, and reuses its output.
9. **The graph is stored in vue-flow shape** (`nodes[]` with `position` and `data`, `edges[]`). No mapping layer between canvas and DB.
10. **`@repo/database` depends on `@repo/workflow`** so the JSON columns are typed with `.$type<WorkflowDefinition>()`. `@repo/workflow` itself depends only on `zod`.
11. **Run job retries.** The run job is enqueued with `attempts: 3` (BullMQ's built-in exponential backoff handles the delay between attempts). A node failure only marks that _step_ `failed` and rethrows; the _run_ stays `running` so the retried job can resume it (completed/skipped steps are reused idempotently, the failed step gets re-run). Only the processor marks a run terminally `failed`, and only on the job's last attempt.
12. **Fail-fast enqueue.** Queues use `enableOfflineQueue: false`, so a Redis outage makes `queueAddJob` throw. The run-start endpoint catches that, best-effort marks the just-created run `failed`, and returns a 500, instead of leaving the run stuck `pending` with no job behind it.
13. **Cancel is a status, not a job kill.** `POST /workflow/run/:runId/cancel` sets the run's status to `cancelled` while it's `pending`/`running`. The engine treats `cancelled` like the other terminal statuses on the stale-retry guard, and additionally re-checks the run's status before starting each node so a mid-flight cancel stops the run before its next node runs, without overwriting the `cancelled` status.

## Package: `@repo/workflow` (`packages/workflow/`)

Scaffold mirrors `packages/utils` (tsdown build, ESM `.mjs`, `@repo/ts-config`). Only runtime dependency: `zod`.

Exports:

```ts
// Node configs (Zod schemas + inferred types)
triggerConfigSchema;   // { kind: 'manual' }
agentConfigSchema;     // { agentId?: string; systemPrompt?: string; prompt: string }
toolConfigSchema;      // { tool: 'think'|'webSearch'|'webBrowser'|'imageGen'; input: string }
conditionConfigSchema; // { left: string; operator: ConditionOperator; right?: string }
transformConfigSchema; // { template: string }

// Graph (vue-flow compatible)
type WorkflowNode = {
  id: string;
  type: 'trigger' | 'agent' | 'tool' | 'condition' | 'transform';
  position: { x: number; y: number };
  data: { label: string; config: <config for type> };
};
type WorkflowEdge = { id: string; source: string; target: string; sourceHandle?: 'true' | 'false' };
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
workflowDefinitionSchema; // discriminated union on node type

// Validation beyond shape
validateWorkflowDefinition(def): { valid: true } | { valid: false; errors: string[] }
// checks: exactly one trigger node, graph is a DAG, edges reference existing
// nodes, only condition nodes use sourceHandle true/false

// Draft vs. published drift
isExecutionEquivalent(draft: WorkflowDefinition, published: WorkflowDefinition | null): boolean
// compares only node id/type/data.config and edge source/target/sourceHandle
// (position, label, edge id, and styling are ignored); a null `published`
// (never published) is always non-equivalent

// Templates
resolveTemplate(template: string, ctx: { input: string }): string
// replaces {{input}}; unknown placeholders resolve to ''

// Statuses
WORKFLOW_RUN_STATUSES / WorkflowRunStatus;   // pending running suspended completed failed cancelled
WORKFLOW_STEP_STATUSES / WorkflowStepStatus; // pending running completed failed skipped
```

## Database (`packages/database`)

`src/schema/workflow.schema.ts`, following `agent.schema.ts` conventions (`createId`, `timestamps`, snake_case columns, indexes on FKs):

- `workflows`: `id`, `user_id` (FK user, cascade), `name`, `description`, `definition` (JSON, `WorkflowDefinition`), `published_definition` (JSON, nullable), timestamps.
- `workflow_runs`: `id`, `workflow_id` (FK, cascade), `status` (text, default `pending`), `definition` (JSON snapshot), `input` (text, nullable), `output` (text, nullable), `error` (text, nullable), `started_at` / `finished_at` (timestamp_ms, nullable), timestamps.
- `workflow_run_steps`: `id`, `run_id` (FK, cascade), `node_id` (text), `status`, `input` / `output` / `error` (text, nullable), `tool_calls` (JSON, nullable, `WorkflowToolCall[]`; only set for agent-node steps that ran with tools), `started_at` / `finished_at`, timestamps. Unique index on (`run_id`, `node_id`).

Registered in `schema/index.ts` and `relations.ts` (user has many workflows, workflow has many runs, run has many steps). Repositories follow `agent.repo.ts` style (plain exported async functions, object params):

- `workflow.repo.ts`: `upsertWorkflow`, `getWorkflowById({ workflowId, userId })`, `getAllWorkflowsByUserId` (+ count, pagination like agents), `deleteWorkflowById`, `publishWorkflow` (copies `definition` to `published_definition`).
- `workflow-run.repo.ts`: `createWorkflowRun` (snapshots definition), `getRunById` (with steps), `getRunsByWorkflowId`, `getRunForExecution({ runId })` (no userId check, includes workflow for `userId`), `updateRunStatus`, `upsertRunStep`, `getStepsByRunId`.

Migration generated with `pnpm --filter @repo/database db:generate`.

## Queue (`packages/queue`)

- `WORKFLOWS_QUEUE = 'workflows-queue'` in `src/constants/index.ts`.
- `src/dtos/workflow-run-job.dto.ts`: `WORKFLOW_RUN_JOB = 'workflow-run-job'` and `WorkflowRunJobDto { runId: string }` in the existing class-with-`fromJSON`/`toJSON` style.
- `workflow: () => getOrCreateQueue({ name: WORKFLOWS_QUEUE })` added to `src/queues/index.ts`.

## Worker (`apps/worker`)

`src/workflow/` holds the engine. `src/processors/workflow.processor.ts` is registered in `processors/index.ts` and owns terminal run failure (see below).

Engine (`src/workflow/engine.ts`):

1. Load run via `getRunForExecution`. Ignore runs already `completed`, `failed`, or `cancelled` (stale retry guard).
2. Mark run `running`, set `started_at`.
3. Walk the DAG in topological order. A node is ready when all its incoming edges come from finished nodes. Nodes reachable only through a not-taken condition handle are marked `skipped` (transitively).
4. Before starting each node, re-check the run's status with a cheap column-only read (`getRunStatus`). If it's been set to `cancelled` (by the cancel endpoint, mid-flight), stop executing without touching that status.
5. Per node: reuse a completed step row if present (idempotent retry); otherwise write a `running` step row, execute via the executor map, write output (and `toolCalls`, if any) and `completed`.
6. Executor context: `{ input: <resolved node input>, userId }`, where `input` is the node's upstream output(s) (`run.input ?? ''` for nodes fed by the trigger). Each executor returns `{ output: string; toolCalls?: WorkflowToolCall[] }`; chaining (`outputs` map, `{{input}}`) only ever uses `output`. `toolCalls` is persisted once with the completed step (no live mid-node updates) and is currently only ever produced by the agent executor's `agentId` path.
7. On node failure: the step is marked `failed` with the error and the engine rethrows. It does **not** mark the run `failed` — the run stays `running` so a BullMQ retry can resume it. Terminal run failure is the processor's job.
8. On success: run `completed`, `output` from terminal node(s), `finished_at`.

Processor (`src/processors/workflow.processor.ts`): wraps `executeWorkflowRun` in try/catch. On error, it checks whether this was the job's last attempt — `job.attemptsMade + 1 >= (job.opts.attempts ?? 1)` — and if so, best-effort marks the run `failed` with the error message and `finishedAt` (guarded so it never overwrites a run that's already `completed`/`failed`/`cancelled`). It always rethrows so BullMQ still records the attempt as failed and can retry. This also covers errors the engine throws outside `runNode` (run-not-found, the deadlock guard).

`job.attemptsMade` is only incremented by BullMQ _after_ the processor call returns or throws, so inside the processor it still reflects prior attempts, not the current one — mirroring BullMQ's own internal `shouldRetryJob` check (`attemptsMade + 1 < attempts` ⇒ retry). Verified against the installed `bullmq` version's source (`moveToFinished-14.lua` increments `atm` after the job settles; `Job.shouldRetryJob` in `job.js` compares against the pre-increment value).

Executors (`src/workflow/executors/`), one per node type:

- `trigger`: returns the run input.
- `agent`: resolves the prompt template. When `agentId` is set, loads the agent row (system prompt, model, `tools`, `settings`) and calls `generateText` with `tools()`/`activeTools`/`stopWhen: stepCountIs(5)`/temperature/maxOutputTokens, mirroring the chat controller; `result.steps[].toolCalls` (`{ toolCallId, toolName, input }`) are joined with `result.steps[].toolResults` (`{ toolCallId, output }`) by `toolCallId` into `WorkflowToolCall[]`. `toolResults` omits calls that errored, so those are recovered from `result.steps[].content`'s `type: 'tool-error'` parts (`{ toolCallId, error }`) instead. Otherwise uses the config `systemPrompt` and the default agent's model with a plain `generateText`, no tool calls, no `toolCalls`.
- `tool`: resolves the input template and calls the matching `@repo/ai` tool's `execute`.
- `condition`: resolves `left`/`right`, applies the operator, returns `'true'`/`'false'`. The engine uses this to pick the outgoing `sourceHandle`.
- `transform`: `resolveTemplate(config.template, ctx)`.

## API (`apps/api`)

`src/controllers/workflow.controller.ts`, base path `/workflow`, `authMiddleware`, validation middlewares in `middlewares/validationMiddlewares` (existing zValidator pattern), errors via `tryCatch` + exceptions, mounted in `app.ts`. Contract:

| Route                                | Body                                      | Response                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /workflow` (pagination query)   |                                           | `{ workflows, meta: { totalCount } }`                                                                                                                          |
| `POST /workflow`                     | `{ id?, name, description?, definition }` | `{ workflow }`                                                                                                                                                 |
| `GET /workflow/:workflowId`          |                                           | `{ workflow }`                                                                                                                                                 |
| `DELETE /workflow/:workflowId`       |                                           | `{ message }`                                                                                                                                                  |
| `POST /workflow/:workflowId/publish` |                                           | `{ workflow }` — 400 with `errors` when `validateWorkflowDefinition` fails                                                                                     |
| `POST /workflow/:workflowId/run`     | `{ input?: string }`                      | `{ run }` — 400 when not published; creates run row then `queueAddJob` (`attempts: 3`); on enqueue failure, best-effort marks the run `failed` and returns 500 |
| `GET /workflow/:workflowId/runs`     |                                           | `{ runs }` latest first                                                                                                                                        |
| `GET /workflow/run/:runId`           |                                           | `{ run }` including `steps` — polled by the run view                                                                                                           |
| `POST /workflow/run/:runId/cancel`   |                                           | `{ run }` — 400 when the run isn't `pending`/`running`; sets status `cancelled` and `finishedAt`                                                               |

Save (`POST /workflow`) validates only the shape (`workflowDefinitionSchema`), so incomplete drafts can be saved. Structural validation (`validateWorkflowDefinition`) runs on publish and on run.

## Web (`apps/web`)

- Canvas components via `npx ai-elements-vue@latest add canvas node edge` (Vue Flow based: `@vue-flow/core`, `@vue-flow/background`), landing next to the existing vendored components in `app/components/ai-elements/`.
- Feature module `app/features/workflow/` following `features/agent/` (types, `useWorkflowApi` composable on `useApi()` + TanStack vue-query, components).
- Pages under `app/pages/workflow/`: `index.vue` (list), `create.vue`, `[workflowId]/index.vue` (editor), `[workflowId]/run/[runId].vue` (run view).
- Editor: node palette, canvas, side panel with a per-node-type config form (TanStack vue-form, shadcn-vue inputs, matching `AgentUpsertForm.vue` conventions), save / publish / run actions. Canvas state serializes 1:1 into `definition`.
- Run view: read-only canvas, nodes colored by step status, vue-query polling of `GET /workflow/run/:runId` (`refetchInterval` while `pending`/`running`). Shows a "Cancel run" button while the run is `pending`/`running`, calling `POST /workflow/run/:runId/cancel` and invalidating the run + runs queries. `WorkflowRunStatusBadge` renders `cancelled` with a muted `secondary` badge variant.
- **Tool-call traces.** A step's `toolCalls` flow into the run view two ways: `WorkflowFlowNode.vue` (shared by the editor and the run view) shows a muted sparkles-icon + count next to the type badge when `data.stepToolCallCount` is set (mixed in by `WorkflowRunView.vue`'s node mapping, run-view only); `WorkflowRunStepPanel.vue` renders a "Tool calls" section below Output as a shadcn `Accordion`, one collapsible entry per call with a tool-name badge and pretty-printed JSON input/output (and an error block when the call failed).
- **Run output dialog.** The header's Output line in `WorkflowRunView.vue` is a button (truncated text + a `Maximize2Icon` affordance) that opens a shadcn `Dialog` with the full output, shown in a bordered `rounded-md bg-muted` box (`text-sm`, headings capped to `text-sm` too) styled like a read-only textarea. Rendered via `MessageResponse` (`app/components/ai-elements/message`, wraps `vue-stream-markdown` — the same markdown renderer chat messages already use) unless the output parses as a JSON object (the multi-terminal-node case, see decision 7), in which case it's pretty-printed in a `pre` block instead. A floating outline icon button copies the raw output string (not the rendered markdown), swapping to a checkmark briefly on success, mirroring `CodeBlockCopyButton.vue`'s pattern.
- "Workflows" nav entry in `useNavItems.ts`.
- **Draft/publish drift indicator.** `WorkflowEditor.vue` compares the live canvas (serialized via `toWorkflowDefinition`) against `workflow.publishedDefinition` using `@repo/workflow`'s `isExecutionEquivalent`, and shows an "Unpublished changes" badge next to Save/Publish when they differ (including the never-published case). `WorkflowRunDialog.vue` shows the same check as a warning and, when drifted, swaps the primary action to "Publish & run" (save draft → publish → start run, aborting the run if publish fails validation), keeping "Run published version" as a secondary action that's hidden until something has been published.

## Work split

Four Sonnet subagents. Agent A ran first (foundations), then B, C, D in parallel against the contracts above.

| Agent          | Scope                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| A: foundations | `@repo/workflow` package, DB schema + relations + repos + migration, queue constant + DTO |
| B: worker      | Engine, executors, processor registration                                                 |
| C: api         | Workflow controller, validation middlewares, `app.ts` mount                               |
| D: web         | Canvas install, feature module, editor + run pages, nav                                   |

Verification (type-check, runtime, commits) is handled manually afterwards, per repo convention.

## Deviations and interpretive calls (recorded post-implementation)

- **No request DTOs in `@repo/database`.** Unlike agent/chat, workflows have no `ICreateWorkflow`-style zod types in the database package. Request validation lives in the API's `validationMiddlewares`, using `workflowDefinitionSchema` from `@repo/workflow` directly.
- **Publish/run validation errors bypass the exception classes.** The existing `HTTPException` subclasses only carry a message, so invalid definitions return a plain `c.json({ code: 400, error, errors: string[] }, 400)`.
- **Step `input` column stores the node's resolved `{{input}}` value** (a plain string: the upstream output(s), or the run input for trigger-fed nodes), not a node-type-specific resolved value. The engine is generic and does not know what each executor does with it beyond that.
- **Tool and agent executors share the `tools()` factory and its no-op writer.** `@repo/ai` does not export think/webSearch/webBrowser standalone, so the worker calls `tools(noopWriter, { userId })` with a no-op UIMessage stream writer (`executors/noop-writer.ts`), used both by the standalone tool node and by the agent node's `agentId` path. The tools only use the writer for transient chat UI events. All four tools work, including imageGen.
- **`getAllAgentsByUserId` now selects `tools` and `aiModel.model`** alongside the existing `provider`/`displayName`, so the web agent picker (workflow agent-node config) can show the selected agent's model and tools without a second per-agent fetch.
- **Engine has a deadlock guard.** After the pass loop, any node that never resolved fails the run. Insurance against malformed graphs that slip past publish-time validation.
- **Canvas components were already vendored** (`app/components/ai-elements/{canvas,node,edge,controls,panel,connection}` from an earlier commit), so no ai-elements-vue CLI run. `Canvas.vue`'s slot forwarding was generalized to pass through dynamic `node-*`/`edge-*` slots.
- **Saving strips VueFlow bookkeeping.** `features/workflow/lib/serialize-definition.ts` converts VueFlow's `GraphNode`/`GraphEdge` (which embed full node objects on edges) back to the plain `WorkflowDefinition` shape before save/publish.
- **Config and step panels are fixed asides**, not Sheets (no Sheet component in the repo).
- **`useGetAllAgents()` was added to `features/agent`** for the agent-node picker (unpaginated list, mirrors `useGetAllAiModels`).
- **Migration note:** `20260713094811_secret_harpoon` also contains no-op recreates of `agents`/`agent_templates` from pre-existing schema drift (data preserved via `INSERT INTO ... SELECT`). Review before applying.
