# Workflows: team node (multi-agent delegation)

**Status: implemented (delegate mode plus the agent-trace increment), July 2026.** `roundRobin` mode remains future work.

Companion to [README.md](./README.md) (architecture overview) and [workflows-implementation.md](./workflows-implementation.md) (v1 contracts). Adds a multi-agent node: a lead agent that delegates to a small team of member agents and synthesizes their reports.

## Problem

The agent node runs exactly one agent per node. Complex tasks (research, then write, then critique) can only be expressed as hand-wired chains of agent nodes, and chains are strictly feed-forward. There is no way for agents to collaborate iteratively: delegate, review the result, re-delegate or refine.

Modeling collaboration as edges between agent nodes on the canvas is off the table. Reporting back is a cycle, and the engine's core invariants all assume each node runs at most once per run: the strict DAG pass loop, step rows unique on (`run_id`, `node_id`), retry-resume via reused completed rows, and the between-nodes cancel check. Supporting real cycles would mean redesigning the run model.

So: one canvas node, all collaboration inside the executor. The canvas stays a clean DAG (`trigger -> team -> transform`), the engine stays untouched, and the team node is simply a sixth executor. The precedent is the agent node itself, which already runs a full chat-style tool loop inside one node.

## Use cases

1. **Divide and conquer.** Lead splits a task across specialists (researcher, writer, critic) and merges the results.
2. **Produce and review.** Lead bounces a draft between a writer member and a critic member until it is good enough, within budget.
3. **Parallel fan-out.** Lead sends independent subtasks to several members in one step; they run concurrently.

Out of scope for v1 (deliberately):

- **`roundRobin` mode** (peer back-and-forth with a fixed turn order and `maxRounds`, no lead). The config schema is a discriminated union on `mode` so this slots in later without migration. Until then, produce-and-review runs through the lead.
- A generic loop container that repeats arbitrary inner nodes. It reintroduces the multi-execution problem for every node type. Agent collaboration is the actual use case; build that directly.
- Teams nesting teams. Members are plain agents.

## Design decisions (confirmed)

1. **New node type `team`.** Added to `NODE_TYPES`, the definition schema union, and the palette. Config schema:

   ```ts
   const teamMemberSchema = z.object({
     agentId: z.string(),
     // Tells the lead when to hand work to this member. Allowed empty so a
     // freshly added node passes draft save (draft saves parse the full
     // config schema); the executor falls back to the member's agent name.
     role: z.string(),
   });

   const delegateTeamConfigSchema = z.object({
     mode: z.literal('delegate'),
     leadAgentId: z.string().optional(), // default agent if unset
     prompt: z.string().min(1), // template, {{input}} supported
     members: z.array(teamMemberSchema).min(1).max(5),
   });

   // Single-member union today; `roundRobin` joins it later.
   export const teamConfigSchema = z.discriminatedUnion('mode', [delegateTeamConfigSchema]);
   ```

2. **The lead orchestrates via the tool loop.** The executor resolves the lead (referenced agent or default agent), appends a team briefing to its instructions (member names, roles, delegation protocol), and runs `generateText` with one delegation tool per member. The AI SDK loop is the orchestration: the lead delegates, reads reports, re-delegates or refines, then writes the final answer. Parallel tool calls in one step run members concurrently.

3. **One delegate tool per member, not one tool with a member enum.** Tool name `delegate_to_<slug>` (slug from the member agent's name, numeric suffix on collision; the same agent may appear twice with different roles). The tool description carries the member's role, which is where the model looks when routing work. Input schema stays a flat `z.object({ task: z.string() })`, satisfying the flat-input-schema constraint for Anthropic models.

   Placement: `buildDelegateTools` lives in the worker's `team.executor.ts`, not in `@repo/ai`. It is team-node domain logic (it closes over `runReferencedAgent`, the executor context, and the nested tool-call capture), while `@repo/ai` only re-exports the tool-definition surface (`tool`, `ToolSet`, `z`). Revisit when a second consumer of delegate-tool construction appears (`roundRobin` mode, or a chat-side agent-as-tool feature); then a shared factory in `@repo/ai` earns its place.

4. **Members run with their full agent config.** A delegate call executes the member exactly like the referenced-agent path in `agent.executor.ts`: `buildAgentInstructions`, `buildAgentToolset` with the noop writer, `toModelSettings`, `stepCountIs(15)`. The member's final text is the tool output, i.e. the report to the lead. The shared "run a referenced agent" logic gets extracted from `agent.executor.ts` into a helper both executors use.

5. **A referenced lead runs with its own toolset plus the delegate tools.** V1 initially shipped the lead delegate-only, and the first real run showed why that fails: a lead with the datasets tool and a pinned dataset could see the dataset in its instructions but not read it, so it delegated the read to a member without dataset access. The lead's `buildAgentToolset` output is now merged with the `delegate_to_*` tools (no name collisions, the prefix is reserved). The default-agent lead stays tool-less, matching the agent node's inline path.

6. **Budgets.** Lead: `stepCountIs(12)`. Members: `stepCountIs(15)` each, matching the agent node. Worst case is large (12 lead steps, each fanning out); acceptable for now, quotas come later with billing.

7. **Nested tool-call capture.** `WorkflowToolCall` gains an optional `calls?: WorkflowToolCall[]`. Each delegate call records the task as input, the report as output, and the member's own tool calls as `calls`. Everything still lands in the step row's existing `toolCalls` jsonb; no schema change.

8. **Failure model.** A failing delegate call surfaces as a tool error to the lead (same mechanics as any tool error), so the lead can retry or route around it; it does not fail the step. The step fails only when the lead's own generation throws, with unchanged retry semantics: the BullMQ retry re-runs the whole team node from scratch, exactly like the agent node today. Likewise cancel is only checked between nodes, so a running team node finishes its loop first; same as the agent node.

## User experience

**Builder:** a new "Team" node in the palette. Config aside: optional lead agent picker (falls back to the default agent), prompt textarea with `{{input}}`, and a member list (1 to 5 rows) with an agent picker and a role text per row. The canvas node shows the lead and the member count.

**Run view:** the team step shows the lead's delegate calls. Expanding one shows the task sent, the member's report, and (nested) the tool calls the member made itself.

## Increment: agent trace (full team visibility)

Added July 2026 after the first real runs. The flat `toolCalls` capture drops the "decisions" part of a team run: the lead's assistant text between tool steps (why it delegated, how it judged a report), timing, and token usage. Only the final text survives as step output. Third-party tracing (Langfuse etc.) was considered and rejected for this need: it serves developer dashboards, not the run view. The AI SDK's OTel flag (`experimental_telemetry`) stays available for dev-side tracing later; nothing here blocks it.

Design:

1. **Ordered trace instead of a flat call list.** New types in `@repo/workflow`:

   ```ts
   export type WorkflowTokenUsage = {
     inputTokens?: number;
     outputTokens?: number;
     totalTokens?: number;
   };

   // One entry per AI SDK step of the node's own agent loop.
   export type WorkflowAgentTraceStep = {
     text?: string; // the agent's commentary in that step: the decision record
     usage?: WorkflowTokenUsage;
     toolCalls: WorkflowToolCall[];
   };
   ```

   `WorkflowToolCall` gains `durationMs?` and `usage?` (filled for delegate calls from the member's run) next to the existing `calls?`. Member capture stays a flat call list for now; per-member trace steps are a later refinement.

2. **Storage: `workflow_run_steps.tool_calls` becomes `trace`** (`WorkflowAgentTraceStep[]`, jsonb, `db:push`, old run data may be dropped; no backward compat needed). Executors return `trace` instead of `toolCalls`.

3. **Capture is shared.** The collect helper in the worker maps `result.steps` (text, tool calls, per-step usage) to trace steps, skipping steps with neither text nor calls. Both the agent node and the team node get the trace for free; delegate calls time the member run and attach its total usage.

4. **Run view renders a timeline per step:** commentary text, then the calls it triggered (expandable into nested member calls), with duration and token badges.

5. **Live debug log.** Each finished loop step (lead and every referenced-agent run) is also written to the worker's debug log via `onStepFinish`, in the same shape as the stored trace, so long runs can be followed while they execute. Enabled by `LOG_LEVEL=debug`.

## Changes by package

| Area             | Change                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@repo/workflow` | `team` in `NODE_TYPES`, `teamConfigSchema`, definition union entry, `calls?` on `WorkflowToolCall`                                                                       |
| `apps/worker`    | `team.executor.ts`, registration in `executors/index.ts`, shared referenced-agent helper extracted from `agent.executor.ts`                                             |
| `apps/web`       | Palette entry, canvas node component, config aside (lead picker, prompt, member list), run view nested tool-call rendering, i18n (`de-DE`, `en-UK`)                     |
| `apps/api`       | None (publish validation comes from `@repo/workflow`)                                                                                                                   |
| `@repo/database` | None (definitions and `toolCalls` are jsonb)                                                                                                                            |

## Open questions for review

1. **Validate member `agentId`s at publish?** The agent node checks existence only at runtime ("Agent not found"). Proposal: keep runtime-only for consistency; revisit both together.
2. **Team briefing wording.** The appended lead instructions (delegation protocol, when to stop) need prompt iteration during implementation; not a design blocker.
