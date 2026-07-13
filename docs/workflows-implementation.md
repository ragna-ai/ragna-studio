# Workflows: implementation plan

Companion to [workflows.md](./workflows.md) (the design). This document fixes the concrete contracts and records the work split used to implement v1. All interfaces below are binding: the worker, API, and web implementations were built in parallel against them.

## Decisions (v1 scope)

1. **No Mastra.** Own interpreter, see workflows.md.
2. **Trigger is manual-only.** The config keeps a `kind` discriminator so cron/webhook can be added without a schema migration.
3. **Condition node uses a safe comparator, not a free expression.** No expression parser, no eval. Config: `{ left, operator, right? }` where `left`/`right` are templates and operator is one of `equals | notEquals | contains | isEmpty | isNotEmpty`. Branching uses edge `sourceHandle: 'true' | 'false'`.
4. **Agent node does plain `generateText`** (system prompt + resolved prompt), no tool calls. Tools are their own node type that invokes the `@repo/ai` tool `execute` functions directly.
5. **Templates** use `{{input}}` (run input) and `{{nodes.<nodeId>}}` (output of an upstream node). Resolution lives in `@repo/workflow` so web and worker share it.
6. **Step statuses** are `pending | running | completed | failed | skipped`. Run statuses are `pending | running | suspended | completed | failed`. `skipped` marks nodes on a condition branch that was not taken. `suspended` is reserved for the future `human-approval` node.
7. **Run output** is the output of the terminal node (no outgoing edges). Multiple terminals produce an object keyed by node id.
8. **Idempotent retries.** Before executing a node, the engine checks for an existing completed step row for that run and node, and reuses its output.
9. **The graph is stored in vue-flow shape** (`nodes[]` with `position` and `data`, `edges[]`). No mapping layer between canvas and DB.
10. **`@repo/database` depends on `@repo/workflow`** so the JSON columns are typed with `.$type<WorkflowDefinition>()`. `@repo/workflow` itself depends only on `zod`.

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

// Templates
resolveTemplate(template: string, ctx: { input: string; nodes: Record<string, string> }): string
// replaces {{input}} and {{nodes.<id>}}; unknown placeholders resolve to ''

// Statuses
WORKFLOW_RUN_STATUSES / WorkflowRunStatus;   // pending running suspended completed failed
WORKFLOW_STEP_STATUSES / WorkflowStepStatus; // pending running completed failed skipped
```

## Database (`packages/database`)

`src/schema/workflow.schema.ts`, following `agent.schema.ts` conventions (`createId`, `timestamps`, snake_case columns, indexes on FKs):

- `workflows`: `id`, `user_id` (FK user, cascade), `name`, `description`, `definition` (JSON, `WorkflowDefinition`), `published_definition` (JSON, nullable), timestamps.
- `workflow_runs`: `id`, `workflow_id` (FK, cascade), `status` (text, default `pending`), `definition` (JSON snapshot), `input` (text, nullable), `output` (text, nullable), `error` (text, nullable), `started_at` / `finished_at` (timestamp_ms, nullable), timestamps.
- `workflow_run_steps`: `id`, `run_id` (FK, cascade), `node_id` (text), `status`, `input` / `output` / `error` (text, nullable), `started_at` / `finished_at`, timestamps. Unique index on (`run_id`, `node_id`).

Registered in `schema/index.ts` and `relations.ts` (user has many workflows, workflow has many runs, run has many steps). Repositories follow `agent.repo.ts` style (plain exported async functions, object params):

- `workflow.repo.ts`: `upsertWorkflow`, `getWorkflowById({ workflowId, userId })`, `getAllWorkflowsByUserId` (+ count, pagination like agents), `deleteWorkflowById`, `publishWorkflow` (copies `definition` to `published_definition`).
- `workflow-run.repo.ts`: `createWorkflowRun` (snapshots definition), `getRunById` (with steps), `getRunsByWorkflowId`, `getRunForExecution({ runId })` (no userId check, includes workflow for `userId`), `updateRunStatus`, `upsertRunStep`, `getStepsByRunId`.

Migration generated with `pnpm --filter @repo/database db:generate`.

## Queue (`packages/queue`)

- `WORKFLOWS_QUEUE = 'workflows-queue'` in `src/constants/index.ts`.
- `src/dtos/workflow-run-job.dto.ts`: `WORKFLOW_RUN_JOB = 'workflow-run-job'` and `WorkflowRunJobDto { runId: string }` in the existing class-with-`fromJSON`/`toJSON` style.
- `workflow: () => getOrCreateQueue({ name: WORKFLOWS_QUEUE })` added to `src/queues/index.ts`.

## Worker (`apps/worker`)

`src/workflow/` holds the engine, `src/processors/workflow.processor.ts` is thin and registered in `processors/index.ts`.

Engine (`src/workflow/engine.ts`):

1. Load run via `getRunForExecution`. Ignore runs not in `pending`/`running`.
2. Mark run `running`, set `started_at`.
3. Walk the DAG in topological order. A node is ready when all its incoming edges come from finished nodes. Nodes reachable only through a not-taken condition handle are marked `skipped` (transitively).
4. Per node: reuse a completed step row if present (idempotent retry); otherwise write a `running` step row, execute via the executor map, write output and `completed`.
5. Executor context: `{ input: run.input ?? '', nodes: <outputs by node id>, userId }`. All node outputs are strings.
6. On node failure: step `failed` with error, run `failed`, rethrow so BullMQ records the failure.
7. On success: run `completed`, `output` from terminal node(s), `finished_at`.

Executors (`src/workflow/executors/`), one per node type:

- `trigger`: returns the run input.
- `agent`: resolves the prompt template; loads the agent row when `agentId` is set (system prompt + model), otherwise uses the config `systemPrompt` and the default model; calls `generateText` from `@repo/ai`.
- `tool`: resolves the input template and calls the matching `@repo/ai` tool's `execute`.
- `condition`: resolves `left`/`right`, applies the operator, returns `'true'`/`'false'`. The engine uses this to pick the outgoing `sourceHandle`.
- `transform`: `resolveTemplate(config.template, ctx)`.

## API (`apps/api`)

`src/controllers/workflow.controller.ts`, base path `/workflow`, `authMiddleware`, validation middlewares in `middlewares/validationMiddlewares` (existing zValidator pattern), errors via `tryCatch` + exceptions, mounted in `app.ts`. Contract:

| Route | Body | Response |
| --- | --- | --- |
| `GET /workflow` (pagination query) | | `{ workflows, meta: { totalCount } }` |
| `POST /workflow` | `{ id?, name, description?, definition }` | `{ workflow }` |
| `GET /workflow/:workflowId` | | `{ workflow }` |
| `DELETE /workflow/:workflowId` | | `{ message }` |
| `POST /workflow/:workflowId/publish` | | `{ workflow }` — 400 with `errors` when `validateWorkflowDefinition` fails |
| `POST /workflow/:workflowId/run` | `{ input?: string }` | `{ run }` — 400 when not published; creates run row then `queueAddJob` |
| `GET /workflow/:workflowId/runs` | | `{ runs }` latest first |
| `GET /workflow/run/:runId` | | `{ run }` including `steps` — polled by the run view |

Save (`POST /workflow`) validates only the shape (`workflowDefinitionSchema`), so incomplete drafts can be saved. Structural validation (`validateWorkflowDefinition`) runs on publish and on run.

## Web (`apps/web`)

- Canvas components via `npx ai-elements-vue@latest add canvas node edge` (Vue Flow based: `@vue-flow/core`, `@vue-flow/background`), landing next to the existing vendored components in `app/components/ai-elements/`.
- Feature module `app/features/workflow/` following `features/agent/` (types, `useWorkflowApi` composable on `useApi()` + TanStack vue-query, components).
- Pages under `app/pages/workflow/`: `index.vue` (list), `create.vue`, `[workflowId]/index.vue` (editor), `[workflowId]/run/[runId].vue` (run view).
- Editor: node palette, canvas, side panel with a per-node-type config form (TanStack vue-form, shadcn-vue inputs, matching `AgentUpsertForm.vue` conventions), save / publish / run actions. Canvas state serializes 1:1 into `definition`.
- Run view: read-only canvas, nodes colored by step status, vue-query polling of `GET /workflow/run/:runId` (`refetchInterval` while `pending`/`running`).
- "Workflows" nav entry in `useNavItems.ts`.

## Work split

Four Sonnet subagents. Agent A ran first (foundations), then B, C, D in parallel against the contracts above.

| Agent | Scope |
| --- | --- |
| A: foundations | `@repo/workflow` package, DB schema + relations + repos + migration, queue constant + DTO |
| B: worker | Engine, executors, processor registration |
| C: api | Workflow controller, validation middlewares, `app.ts` mount |
| D: web | Canvas install, feature module, editor + run pages, nav |

Verification (type-check, runtime, commits) is handled manually afterwards, per repo convention.

## Deviations and interpretive calls (recorded post-implementation)

- **No request DTOs in `@repo/database`.** Unlike agent/chat, workflows have no `ICreateWorkflow`-style zod types in the database package. Request validation lives in the API's `validationMiddlewares`, using `workflowDefinitionSchema` from `@repo/workflow` directly.
- **Publish/run validation errors bypass the exception classes.** The existing `HTTPException` subclasses only carry a message, so invalid definitions return a plain `c.json({ code: 400, error, errors: string[] }, 400)`.
- **Step `input` column stores the full template context** (`{ input, nodes }` as JSON), not a node-type-specific resolved value. The engine is generic and does not know what each executor resolves.
- **Tool executor uses the `tools()` factory.** `@repo/ai` does not export think/webSearch/webBrowser standalone, so the worker calls `tools(noopWriter, { userId })` with a no-op UIMessage stream writer (the tools only use the writer for transient chat UI events). All four tools work, including imageGen.
- **Engine has a deadlock guard.** After the pass loop, any node that never resolved fails the run. Insurance against malformed graphs that slip past publish-time validation.
- **Canvas components were already vendored** (`app/components/ai-elements/{canvas,node,edge,controls,panel,connection}` from an earlier commit), so no ai-elements-vue CLI run. `Canvas.vue`'s slot forwarding was generalized to pass through dynamic `node-*`/`edge-*` slots.
- **Saving strips VueFlow bookkeeping.** `features/workflow/lib/serialize-definition.ts` converts VueFlow's `GraphNode`/`GraphEdge` (which embed full node objects on edges) back to the plain `WorkflowDefinition` shape before save/publish.
- **Config and step panels are fixed asides**, not Sheets (no Sheet component in the repo).
- **`useGetAllAgents()` was added to `features/agent`** for the agent-node picker (unpaginated list, mirrors `useGetAllAiModels`).
- **Migration note:** `20260713094811_secret_harpoon` also contains no-op recreates of `agents`/`agent_templates` from pre-existing schema drift (data preserved via `INSERT INTO ... SELECT`). Review before applying.
