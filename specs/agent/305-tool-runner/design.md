# Agents: one tool definition per tool, one runner (design)

> **Status: proposed** (2026-11-07). Issue #305. Builds on #301 (PR #304). Build plan:
> [slices.md](./slices.md).

A refactor with no PRD: users see no change. The problem statement lives in #305. This doc holds
the decisions, the contract and the files that change.

## Problem in one paragraph

`@repo/ai` writes tools in two ways. Datasets and cloud drive use `ToolDefinition`, which the MCP
endpoint and `toAgentTools` share. Every other built-in calls `tool()` directly with positional
arguments and its own `writer.write`. Datasets have both. So the AI SDK adapter exists twice, the
access filter exists twice (`toAgentTools` and `getAllowedToolDefinitions`), and errors come in
four styles: a typed status union, `{ error: string }`, a throw, and a silent catch. There is no
single place for logging, approval policy (#281) or audit.

## Acceptance criteria

- **AC-1** Given an agent with one grant per agent tool, when its tools are built, then the model
  gets the same AI SDK tool names as before the refactor.
- **AC-2** Given an agent with `imageGen` or `videoGen` in chat, when the tool runs, then the
  stream carries the same transient data part as before.
- **AC-3** Given a tool whose `execute` throws, when the model calls it, then the call fails with
  a generic message that names the tool, and the thrown error's text is not in the stream.
- **AC-4** Given the web browser service is unreachable, when the model calls `webBrowser`, then
  it gets a result with a failure status and a message, not a thrown error.
- **AC-5** Given an MCP connection with datasets at `read`, when it lists tools, then it gets the
  same tools as before.
- **AC-6** Given a workflow run, when it builds an agent's tools, then no stream writer is needed.
- **AC-7** Rule: in `packages/ai/src/tools/`, only `tool-definition.ts` imports `tool` from `ai`.

## Decisions

**D1. UI events are data on the definition, and only two tools keep one.** The web reads only
`data-imageGen` and `data-videoGen` (`ChatConversation.vue`). The eight other `writer.write`
calls are written and never read. They are deleted. `ToolDefinition` gets an optional
`uiEvent(input)`, and the runner writes it when a writer is present. `execute` never sees a
writer. Rejected: the writer in the context, which ties `execute` to the chat transport again.

**D2. Agent-only values are bound when definitions are built.** `ToolContext` stays the per-call
identity: `userId`, `workspaceId`, `origin`. Values only agents have (`agentId`, `runsInWorker`)
are arguments of the builder that returns the definitions, for example
`documentToolDefinitions({ agentId })`. That also covers the image and video descriptions that
depend on `runsInWorker`. Rejected: optional `agentId?` on `ToolContext`, which moves the check
into every `execute`. Rejected: a union keyed on `origin`, which makes every agent-only tool
narrow it.

**D3. One registry for all agent tools.** With every tool a definition list, built-in and
integration factories have the same type. `toolsets` and `accessToolsets` merge into one record
keyed by `AgentToolId`. A grant with `access` filters the list with `filterByAccess`. The same
helper replaces the filter in `apps/api/src/services/mcp-integrations.ts`.

**D4. Expected failures are returned, unexpected ones are thrown and cleaned.** A tool returns a
`ToolFailure` (`{ status, message }`) for outcomes the model can act on: not connected, not
found, too large, busy, unavailable. Anything thrown is caught by the runner, logged with the
tool name and context, and rethrown as a `ToolExecutionError` with a generic message. The AI SDK
and MCP still show it as a failed call. Rejected: catching and returning a failure, which turns a
red error state in the chat into a normal result. The API errors standard (RFC 9457) covers HTTP
responses and leaves model-read errors out. Its rule that unhandled error text never reaches the
client applies here too. `ToolFailure` keeps the shape cloud drive tools already return.

**D5. No classes, no AI SDK `contextSchema`.** Tools are stateless operations with per-call
context. The AI SDK, the OpenAI Agents SDK and Mastra all use definition objects or functions.
`ToolDefinition` must stay transport-neutral for MCP, which has no `toolsContext`. Building
definitions per request costs nothing measurable.

## Contract

`packages/ai/src/tools/tool-definition.ts`:

```ts
export interface ToolContext {
  userId: string;
  workspaceId: string;
  origin: ToolOrigin;
} // unchanged

export interface ToolFailure<Status extends string = string> {
  status: Status;
  /** Short, model-facing, actionable. Never contains a token or internal error text. */
  message: string;
}

export interface ToolUiEvent {
  type: `data-${string}`;
  data: unknown;
}

export interface ToolDefinition<Schema extends z.ZodObject, Output> {
  name: string;
  description: string;
  inputSchema: Schema;
  access: ToolAccess;
  annotations?: ToolAnnotations;
  uiEvent?(input: z.infer<Schema>): ToolUiEvent;
  execute(input: z.infer<Schema>, ctx: ToolContext): Promise<Output>;
}

/** `read` keeps read definitions, `write` keeps all. */
export function filterByAccess(definitions, access: ToolAccess): ToolDefinition[];

/** Runs one call: logs and cleans a throw. Used by the AI SDK and the MCP adapter. */
export function executeTool(
  definition,
  input,
  ctx: ToolContext,
  log: ToolRunLog,
): Promise<unknown>;

export class ToolExecutionError extends Error {} // generic message naming the tool

/** The only AI SDK adapter. Writes `uiEvent` when `writer` is set. */
export function toAgentTools(definitions, options: AgentToolsOptions): ToolSet;
```

- `ToolRunLog` carries the fields the log line needs beyond `ToolContext` (`agentId` for agents,
  `connectionId` for MCP). Final name and shape are settled in S0.
- `CloudDriveToolFailure` becomes `ToolFailure<CloudDriveFailureStatus>`. Its statuses stay.
- `uiEvent` output is written as `{ type, data, transient: true }`, built from named fields.

`packages/ai/src/tools/agent.tools.ts`:

```ts
export interface AgentToolContext {
  userId: string; agentId: string; workspaceId: string;
  runsInWorker?: boolean; retrievalMode?: boolean;
  writer?: UIMessageStreamWriter; // set in chat, absent in workflows
}

type AgentToolDefinitions = (ctx: AgentToolContext) => readonly ToolDefinition<z.ZodObject, unknown>[];
const agentToolDefinitions = { think: ..., datasets: ..., 'google-drive': ... }
  satisfies Record<AgentToolId, AgentToolDefinitions>;

export function buildAgentToolset(grants: readonly StoredAgentToolGrant[], ctx: AgentToolContext): ToolSet;
```

Builders per file, each returning `ToolDefinition[]` or one definition:

| File                                                                                   | Builder                                                        | Bound values    |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------- |
| `think.tool.ts`, `web-search.tool.ts`, `web-browser.tool.ts`, `linkedin-draft.tool.ts` | constant                                                       | none            |
| `dataset.tools.ts`                                                                     | `datasetToolDefinitions` (exists)                              | none            |
| `document.tools.ts`, `task.tools.ts`                                                   | `documentToolDefinitions`, `taskToolDefinitions`               | `agentId`       |
| `memory.tool.ts`, `agent-context.tool.ts`                                              | `memoryToolDefinition`, `searchContextDocumentsToolDefinition` | `agentId`       |
| `image-gen.tool.ts`, `video-gen.tool.ts`                                               | `imageGenToolDefinition`, `videoGenToolDefinition`             | `runsInWorker`  |
| `cloud-drive.tools.ts`                                                                 | `cloudDriveToolDefinitions(integrationId)` (exists)            | `integrationId` |

Every built-in definition sets `access` (`read` for list, find and read tools, `write` for the
rest). Built-in grants have no level, so they are not filtered yet. #281 reads `access`.

## Changes outside `@repo/ai`

- `apps/api/src/services/mcp-integrations.ts`: `getAllowedToolDefinitions` uses `filterByAccess`.
- `apps/api/src/services/mcp.service.ts`: `registerMcpTool` calls `executeTool`.
- `apps/api/src/services/chat.service.ts`: passes `writer` in the context.
- `apps/worker/src/workflow/executors/noop-writer.ts`: deleted, with its `as unknown as` cast.
  `team.executor.ts` and `run-referenced-agent.ts` pass no writer.
- `apps/web`: no change. `client.ts` keeps exporting `GeneratedAgentImage` and
  `getGeneratedImagesOutput`.
- `.oxlintrc.json`: `no-restricted-imports` for `tool` from `ai` in `packages/ai/src/tools/`,
  off for `tool-definition.ts` (AC-7).
- Removed exports with no reader outside `@repo/ai`: every `getXTool`, `XUiTool`, `XToolInput`,
  `XToolOutput` type, `getCloudDriveTools`. `apps/api/test/stub-stream-writer.ts` goes too.
- `specs/glossary.md`: add **tool definition** and **tool failure**.

## Testing

| Criterion | Level  | Folder                                                                           |
| --------- | ------ | -------------------------------------------------------------------------------- |
| AC-1      | API    | `apps/api/test/agent/` (new, written before the refactor, lists names per grant) |
| AC-2      | API    | `apps/api/test/agent/` (stream writer fake records the parts)                    |
| AC-3      | API    | `apps/api/test/agent/` (a definition that throws, through `toAgentTools`)        |
| AC-4      | API    | `apps/api/test/agent/web-browser-tool.test.ts`                                   |
| AC-5      | API    | existing `apps/api/test/mcp/`                                                    |
| AC-6      | worker | existing `apps/worker/test/workflow/`                                            |
| AC-7      | lint   | `pnpm lint`                                                                      |

Tests that call `getXTool` directly (`document-workspace-references`, `task-workspace-references`)
call `definition.execute(input, ctx)` instead.

## Extension points

- **Axis:** agent tool id. **Contract:** `ToolDefinition` plus one `agentToolDefinitions` entry.
- **Adding a tool:** its definitions in one file, one registry entry, one web visual and i18n
  entry. The id list in `agent-tool-catalog.ts` makes the build fail until all exist.
- **Giving a built-in access levels:** move its id to the access branch of the grant schema and
  backfill a level. Its definitions already carry `access`.
- **Known next users of the runner:** approval policy from `access` and `annotations` (#281),
  audit rows for agent tool calls, output size caps. Each adds to `executeTool` or
  `toAgentTools`, not to every tool.
- **Fakes:** none new. The stream writer fake for AC-2 is typed against `UIMessageStreamWriter`.
- **Packages considered:** none. The AI SDK's `contextSchema` was weighed and rejected (D5).
- **Not abstracted:** classes or a base class (D5). An eval harness for tool count.
