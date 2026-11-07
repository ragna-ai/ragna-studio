# Agents: one tool definition per tool, one runner (slices)

> Build plan for [design.md](./design.md). Every slice follows AGENTS.md and loads the clean-code
> skill, plus tdd for `apps/api` and the packages it reaches. Each slice rebuilds `@repo/ai`, runs
> its own tests and `pnpm check-types` before it reports done.

## Order

| Wave | Slices (parallel within a wave) | Needs            |
| ---- | ------------------------------- | ---------------- |
| 0    | S0 Contract, runner, reference  | #304 merged      |
| 1    | S1, S2, S3, S4                  | S0 on the branch |
| 2    | S5 Integration pass (lead)      | all              |

During wave 1, `agentToolDefinitions` and the old `toolsets` record live side by side: S0 adds
the new record with the reference entries, and each wave 1 slice moves its own entries over.
S5 deletes what is left of the old record.

## Contracts shared by all slices

Frozen by S0. A slice that needs a change asks the lead. It doesn't edit another slice's files.

```ts
// packages/ai/src/tools/tool-definition.ts
interface ToolDefinition<Schema, Output> { name; description; inputSchema; access; annotations?;
  uiEvent?(input): ToolUiEvent; execute(input, ctx: ToolContext): Promise<Output> }
interface ToolFailure<Status extends string = string> { status: Status; message: string }
filterByAccess(definitions, access); runToolDefinition(...); toAgentTools(definitions, options);
class ToolExecutionError

// packages/ai/src/tools/agent.tools.ts
interface AgentToolContext { userId; agentId; workspaceId; runsInWorker?; retrievalMode?; writer? }
type AgentToolDefinitions = (ctx: AgentToolContext) => readonly ToolDefinition[];
```

House rules for converted tools:

- The AI SDK tool name is the definition's `name`. Names don't change (AC-1).
- Descriptions and input schemas are moved, not edited.
- `{ error: '...' }` results become `ToolFailure` with a status that says what happened
  (`unavailable`, `not_found`, `busy`, ...). An internal error message never goes into `message`.
- Unexpected errors are thrown, not caught. The runner logs and cleans them.
- No `writer.write` in a tool file. Only image and video tools define `uiEvent`.

## S0 Contract, runner, reference (lead)

Owns `tool-definition.ts`, `agent.tools.ts`, `think.tool.ts`, `web-search.tool.ts`,
`apps/api/src/services/mcp-integrations.ts`, `apps/api/src/services/mcp.service.ts`,
`.oxlintrc.json`, `specs/glossary.md`, and new tests in `apps/api/test/agent/`.

- First, on the unchanged code: the AC-1 test listing AI SDK tool names per grant. It must pass
  before anything moves. Break one name on purpose once, watch it fail, revert.
- Contract and runner as in the design. AC-3 test with a definition that throws.
- `filterByAccess` in both adapters. MCP calls `runToolDefinition`. AC-5 stays green.
- Convert `think` and `webSearch` as the reference for wave 1.
- `agentToolDefinitions` record with `think`, `webSearch` and `google-drive`.
- AC-7 lint rule, with the not-yet-converted files listed as temporary exceptions that wave 1
  removes.
- Glossary: **tool definition**, **tool failure**.

## S1 Datasets (Sonnet)

Owns `dataset.tools.ts` and `apps/api/test/dataset/`.

- Delete the seven `getDatasetXTool` wrappers and their `writer.write` calls. Set the registry
  entry `datasets: () => datasetToolDefinitions`.
- Failures to `ToolFailure`. MCP tests in `apps/api/test/mcp/` stay green (AC-5).

## S2 Documents and tasks (Sonnet)

Owns `document.tools.ts`, `task.tools.ts`, `apps/api/test/document/`, `apps/api/test/task/`.

- `documentToolDefinitions({ agentId })` and `taskToolDefinitions({ agentId })`. Read tools
  `access: 'read'`, the rest `write`.
- `document-workspace-references` and `task-workspace-references` tests call
  `definition.execute` instead of `getXTool`.

## S3 Small tools (Sonnet)

Owns `web-browser.tool.ts`, `memory.tool.ts`, `linkedin-draft.tool.ts`, `agent-context.tool.ts`,
`apps/api/test/agent/web-browser-tool.test.ts`.

- `webBrowser`: the silent `catch` and the busy and failed paths become `ToolFailure` (AC-4). The
  scraper response is parsed with zod instead of `as string`. An invalid URL is a `ToolFailure`.
- `searchContextDocuments` keeps being added by `buildAgentToolset` in retrieval mode. S3 only
  converts the tool, the lead wires it in S5.

## S4 Media (Sonnet)

Owns `image-gen.tool.ts`, `video-gen.tool.ts`, `apps/api/test/imagegen/`,
`apps/api/test/videogen/`, and the AC-2 test.

- `imageGenToolDefinition({ runsInWorker })` and `videoGenToolDefinition({ runsInWorker })` with
  `uiEvent`. The description still depends on `runsInWorker`.
- `GeneratedAgentImage` and `getGeneratedImagesOutput` stay exported from `@repo/ai/client`.
  `apps/web` must not need a change.

## S5 Integration pass (lead)

- Delete the old `toolsets` and `accessToolsets`, `getCloudDriveTools`, the lint exceptions,
  `noop-writer.ts` and `apps/api/test/stub-stream-writer.ts`.
- Wire `writer` through `chat.service.ts`. Worker executors pass none (AC-6).
- Read each slice's flagged notes and check them on disk.
- `pnpm check-types`, `pnpm check:web-type-graph`, `pnpm lint`, `pnpm test:api`,
  `pnpm test:worker`.
- Bookkeeping: Status `implemented`, `pnpm specs:index`, `specs/overview.md`. No `apps/docs`
  page: users see no change.
