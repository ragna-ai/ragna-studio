# Datasets: shared structured state for humans and agents

**Status: draft PRD, under review. Not implemented.**

Related: [workflow/README.md](./workflow/README.md) (workflows use datasets via agent nodes), [workflow/workflows-human-in-the-loop.md](./workflow/workflows-human-in-the-loop.md) (approval gates compose with dataset-driven flows), [agent-memory.md](./agent-memory.md) (the unstructured counterpart).

## Problem

Agents that run repeatedly need durable, structured state: which items are done, what to work on next, what the human asked for per item. Nothing in the app fits that role today. Agent memory is unstructured text, good for preferences, wrong for a queue. Social-post drafts are content artifacts and become ambiguous the moment they double as a ledger. External spreadsheets (Google Sheets) are human-friendly but a poor agent substrate: A1-notation ranges are error-prone for LLMs, every access crosses an external API, and column drift corrupts silently.

Datasets are the missing primitive: Postgres-backed tables with user-defined typed columns, a grid UI for the human, and a first-class tool family for agents. Ledger and artifact stay separate; the dataset is always the ledger.

## Reference use cases

1. **Human-authored task queue.** A "Blog topics" dataset with columns `topic`, `instructions`, `status`. A workflow runs Mon/Wed/Fri (schedule trigger): the agent node picks the next `todo` row, follows its `instructions` (e.g. "ground with websearch, cite 2 sources"), produces the post as a LinkedIn draft via the existing social-post feature, and updates the row to `drafted`. The row is a small task spec; the agent's tools (webSearch etc.) are steered per row by a plain text column.
2. **Agent-authored plan.** An agent creates a dataset itself, writes its plan as rows, then works through them step by step (in one run or across runs). The plan is durable and inspectable: the human can watch progress in the grid, edit rows between steps, and an approval node can gate execution of the plan. Visible agency instead of ephemeral chain-of-thought.

Both cases are the same primitive with different authors. That symmetry is the point.

## Scope

**In (v1):** dataset CRUD + grid UI, typed columns (`text`, `number`, `date`, `select`), jsonb rows, server-side write validation, the agent tool family, an `origin` marker (user- vs agent-created), a "task tracker" column preset on create.

**Out (deliberately):**

- Formulas, cross-row computation, references between datasets, cell formatting. The line between "dataset" and rebuilding Excel. If computation is needed, the agent is the formula engine.
- **Assignee / handover column.** Deferred on purpose (decision 2026-07-17): "assigned to agent" is confusing when a workflow has multiple agent nodes and meaningless in a chat window with a single agent. Handover semantics can return later once there is a clear executor identity to assign to. Until then, `status` + a notes column cover the practical cases.
- Google Sheets import/export/sync. Possible later connector on top; never the source of truth.
- Real-time collaborative editing, row-level permissions, versioning. Single-user app; last write wins.

## User experience

**Grid:** a new "Datasets" nav entry. The list page follows the workflow-list conventions: paginated table with name, origin badge (user/agent), row count, updated timestamp, and a workspace column in the "All items" view. It participates in the standard three-state workspace switcher (All / Unassigned / specific workspace), with the additive filter applied to both the list and the pagination count. The detail page is a full-width grid: inline cell editing with type-appropriate inputs (text, number, date picker, select dropdown constrained to options), add-row at the bottom, soft delete per row. Column management (add, rename, retype, reorder, select options) lives in a fixed aside, matching the workflow editor's config-panel convention, so the grid itself stays purely about data. Workspace is invisible inside the grid; it only matters for finding the dataset. Creating a dataset offers "Empty" or the "Task tracker" preset (`task` text, `instructions` text, `status` select: todo / in progress / done).

**Agents:** a single "Datasets" toggle in the agent tool list enables the whole tool family for that agent (same UX as the memory tool). When enabled, the card shows an optional "Default dataset" picker (decision 10); pinned agents work deterministically on that dataset without discovery. Chat agents and workflow agent nodes get it identically, since workflow agent nodes already run the referenced agent's full tool config. The workflow standalone tool node does not offer dataset tools (decision 9).

**Trust boundary:** select columns reject values outside their options, and all writes are validated against the column schema. A bad agent write becomes a visible tool error the model can react to, not silent corruption.

## Design decisions (proposed)

1. **Schema.** Two tables, registered in `relations.ts`:
   - `datasets`: `id`, `user_id` (FK, cascade), `workspace_id` (FK, set null), `name`, `description`, `origin` (`'user' | 'agent'`), `columns` jsonb: `Array<{ id: string; name: string; type: 'text' | 'number' | 'date' | 'select'; options?: string[] }>`.
   - `dataset_rows`: `id`, `dataset_id` (FK, cascade), `data` jsonb keyed by **column id** (not name, so renames never break data), plus the shared `timestamps` (`created_at`, `updated_at`, `deleted_at`). These are row-level semantics, not just bookkeeping: for a todo row they answer "when was it added, when was it last touched, when was it removed". Row deletion (grid and tools) is a **soft delete** via `deleted_at`; `datasetListRows` and the grid exclude soft-deleted rows, so an agent can never resurrect or double-process a removed task. `created_at` and `updated_at` are exposed in the grid and in tool responses, so an agent can reason about recency ("skip rows updated in the last hour"). There is no dedicated `completed_at`: a status flip bumps `updated_at`, and a use case needing precise per-status timing adds a `date` column. Row order = `created_at` for v1, no manual reordering.

2. **Validation is server-side and shared.** A `validateRowData(columns, data)` function in `@repo/database` (or a small shared module) checks types and select options on every write, for both the REST endpoints and the agent tools. Unknown column ids are rejected.

3. **Tool family in `@repo/ai`**, alongside the existing tools, using the established context (`userId`, `workspaceId`). Five tools, each with a **flat `z.object` input schema** (top-level unions break the Anthropic API, see repo memory):
   - `datasetCreate({ name, description?, columns })`
   - `datasetFind({ query? })` — list/search the user's datasets, returns ids + schemas
   - `datasetListRows({ datasetId, filter?, limit? })` — filter is equality on one column, v1
   - `datasetAppendRow({ datasetId, data })`
   - `datasetUpdateRow({ datasetId, rowId, data })` — partial update
   `data` is `z.record(z.string(), z.union([z.string(), z.number(), z.null()]))` (unions below top level are fine). Agent-created datasets get `origin: 'agent'`.

4. **One toggle, five tools.** The agent `tools` config gains a single `datasets` entry that expands to the family at tool-build time, mirroring how a user thinks about the capability. The tool picker shows one card.

5. **No new workflow node type.** Workflows use datasets exclusively through agent nodes. The recommended composition for queue processing is **one row per run**: the schedule trigger provides the drumbeat, the dataset makes runs resumable, and each run stays small and observable.

6. **Raise the workflow agent step cap.** The agent executor currently runs `stopWhen: stepCountIs(5)`, which a plan-executing agent exhausts immediately (schema read + row list + work + row update already costs 4). Proposal: `stepCountIs(15)` for workflow agent nodes, chat unchanged. Per-node configurability is a later refinement.

7. **Idempotency caveat, accepted for v1.** A workflow retry re-runs a failed agent node, which can duplicate an append (the engine's idempotent-resume only skips *completed* steps). Mitigation is prompt-level (read before write); a dedup mechanism is not worth its complexity at current stakes. Documented, not solved.

8. **Size guardrail.** Cap rows per dataset (1,000) and columns (20). `datasetListRows` caps `limit` at 100. Keeps tool responses inside sane token budgets and the grid snappy.

9. **Dataset tools are agent tools, exclusively.** The workflow standalone `tool` node (the `WORKFLOW_TOOLS` registry in `packages/workflow/src/tools/`) does **not** gain dataset entries. Datasets reach workflows only through agent nodes running a referenced agent, per the deliberate rule that agent capabilities stay tied to agents (decision 2026-07-17). This keeps one mental model: an agent is configured once (tools, pin, prompt) and behaves identically in chat and in workflows.

10. **Soft pin: optional default dataset per agent.** The datasets tool card in the agent config gains an optional "Default dataset" picker, stored as `agents.default_dataset_id` (nullable FK, `onDelete: 'set null'`). When set, the dataset's id and schema are injected into the agent's system prompt via the existing `buildAgentInstructions` seam (same mechanism the memory tool uses), so the agent skips `datasetFind` and goes straight to row operations. Chat and workflow agent nodes get this for free, since both already build instructions through that seam. The pin is a default, not a cage: the full tool family stays available, so a pinned agent can still create a scratch dataset (self-planning) or read a second one when instructed. Deleting the pinned dataset nulls the FK and the agent degrades gracefully to lookup mode. The picker only offers datasets reachable under the workspace hard filter (decision 11), filtered by the agent's own `workspaceId`. **Rejected:** pinning at the workflow-node level. It would split the source of truth for agent behavior across two places, and the agent node has no per-node tool config today. "Same writer, different queue" is a second agent; node-level overrides can come later if that ever pinches.

11. **Workspace scoping: standard column for humans, hard filter for agents.** `datasets` becomes the sixth workspace-scoped resource: nullable `workspace_id`, `onDelete: 'set null'`, indexed, stamped at creation per the usual rules (grid: active workspace only when a specific one is selected; tools: `ctx.workspaceId`, so a workflow agent's dataset lands in the workflow's workspace and a chat agent's in the chat's). The agent tools, however, deviate from the "view, not wall" principle (decision 2026-07-17): when the tool context carries a `workspaceId` (chat started in a workspace, workflow assigned to one), the entire tool family hard-filters to that workspace. `datasetFind` only returns that workspace's datasets, and row operations on a dataset outside it are rejected with a tool error. A null-workspace context (unassigned chat/workflow) sees all of the user's datasets. Rationale: a human can hold a soft filter in their head, an agent cannot; a wrong-workspace write is silent corruption, and separation of concerns beats reach here. `userId` remains the security boundary underneath, unchanged. The human UI keeps the standard soft three-state filter.

## Changes by package

| Area | Change |
| --- | --- |
| `@repo/database` | `datasets` (incl. `workspace_id`) + `dataset_rows` schema, `agents.default_dataset_id`, relations, repos (dataset CRUD, row CRUD, `validateRowData`, workspace-filtered list + count) (db:push) |
| `@repo/ai` | Five dataset tools + registry entries, `datasets` toggle expansion in the tool factory, workspace hard filter from `ctx.workspaceId`, pinned-dataset injection in `buildAgentInstructions` |
| `apps/api` | `dataset.controller.ts`: dataset CRUD, column management, row CRUD for the grid |
| `apps/worker` | Agent executor: step cap 5 → 15 for workflow agent nodes |
| `apps/web` | Feature module `features/dataset/`, pages (list, detail grid), column manager, task-tracker preset, "Datasets" nav entry, tool-list card with default-dataset picker, i18n (`de-DE`, `en-UK`) |

## Open questions for review

1. **Step cap (decision 6):** flat 15 for workflow agent nodes, or a per-node config field now? Proposed: flat 15.
2. **Row `data` tool input:** typed record (proposed) vs JSON string parsed server-side. The record is cleaner; the string is more forgiving of model quirks.
3. **Select handling on human edits:** the grid constrains input anyway, but should retyping a column (e.g. select → text) migrate existing values or leave them untouched? Proposed: leave untouched; values are jsonb and remain readable.
4. **Agent-created dataset tidiness:** is the `origin` badge + manual delete enough for v1, or add an `archived` flag now? Proposed: badge + delete.
