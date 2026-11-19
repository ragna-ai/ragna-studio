# Agent tools: declared output schemas (PRD)

> **Status: implemented** (2026-11-19, PR #441). Issue #440. Extends #438.

Every agent tool declares the shape of its successful output as a zod schema. The tool runner
checks each output against it, and MCP clients see it in `tools/list`. The output type is derived
from the schema, so the two can't drift.

Today a tool's output is a hand-written TypeScript type at best. Nothing checks it at runtime, so
a renamed or leaked field reaches the model and MCP clients unnoticed.

## Problem

- `ToolDefinition` has an `inputSchema` but no output schema. Only `webSearch` and `webBrowser`
  declare one (#438), and nothing uses it at runtime.
- The MCP server returns `structuredContent` without registering an `outputSchema`, so clients
  can't know the shape in advance.

## Goals

- Every tool output is checked against one declared schema before it reaches the model or an
  MCP client.
- MCP clients can read each tool's output shape from `tools/list`.
- **Success signal:** a field added to a tool's output without updating its schema fails the API
  tests.

## Non-goals

- Validating stored chat history against the schemas. Old messages keep their old shapes.
- A new repo-wide rule for sharing schemas. The clean-code skill (`z.infer`, never a parallel
  type), AGENTS.md (client-safe entry, DTOs as zod schemas) and the tdd skill (strict test
  schemas) already cover it. The tdd skill gains one sentence: a test never imports the schema it
  tests.
- Output schemas for tools from external MCP servers. Every `ToolDefinition` today is ours.

## User stories

Roles: MCP client (an external app connected through the MCP server), developer (anyone changing
the code).

### US-1 Checked tool outputs (P1)

As a developer, I want every tool output checked against its declared shape, so that a renamed
or leaked field fails loudly instead of reaching the model or a client.

- **US-1.1** Given a tool whose output matches its declared shape, when an agent calls it, then
  the agent receives the output unchanged.
- **US-1.2** Given a tool whose output does not match its declared shape, when an agent calls it,
  then the call fails with the generic tool failure message, and the mismatch is logged with the
  tool name.
- **US-1.3** Given a tool that returns an expected failure (e.g. not found), when an agent calls
  it, then the agent receives the failure status and message as today.
- **US-1.4** Rule: a tool can't be defined without an output shape.

### US-2 Output shapes for MCP clients (P1)

As an MCP client, I want each tool's output shape in `tools/list`, so that I can rely on the
structured result without guessing.

- **US-2.1** Given an MCP connection with read access, when the client lists tools, then each
  tool carries an output schema.
- **US-2.2** Given a dataset tool call that succeeds, when the client calls it, then the
  structured result matches the advertised output schema.
- **US-2.3** Given a dataset tool call for a dataset that doesn't exist, when the client calls
  it, then the result is an error with the failure message and no structured content.

## Testing

| Criterion | Level | Folder                               |
| --------- | ----- | ------------------------------------ |
| US-1.1    | API   | `apps/api/test/agent/` (tool runner) |
| US-1.2    | API   | `apps/api/test/agent/` (tool runner) |
| US-1.3    | API   | `apps/api/test/agent/` (tool runner) |
| US-1.4    | types | `pnpm check-types`                   |
| US-2.1    | API   | `apps/api/test/mcp/`                 |
| US-2.2    | API   | `apps/api/test/mcp/`                 |
| US-2.3    | API   | `apps/api/test/mcp/`                 |

Existing per-tool API tests keep their own strict schemas and must stay green after the move.

## Standards checklist

- **Deletion:** n/a, no stored data.
- **Retention:** n/a.
- **Erasure:** n/a.
- **Docs:** `apps/docs/src/content/docs/integrations/mcp.mdx` gets one line: tools advertise their output shape.

## Decisions

**A mismatch is a tool failure, not a log line.** The runner parses each output and throws the
generic `ToolExecutionError` when it doesn't match. The MCP SDK already rejects structured content
that breaks the advertised schema, so failing in the runner keeps agents and MCP consistent and
catches drift in the API tests. Logging and passing the output on lost: a leaked field would
still reach clients.

**Tests never import the schema they test.** API tests keep independent `z.strictObject`
schemas, so a change to a shared schema has to be mirrored in a test on purpose. Snapshotting the
generated JSON Schema lost: snapshot updates get accepted without reading.

## Design

**Contract.** `ToolDefinition<InputSchema, OutputSchema, FailureStatus>` gains a required
`outputSchema: OutputSchema` (a `z.ZodObject`, since MCP needs an object root). `execute` returns
`z.infer<OutputSchema> | ToolFailure<FailureStatus>`. The hand-written output interfaces are
deleted; exported output types become `z.infer` of the schema.

**Runner.** `executeTool` parses the output with `outputSchema.or(strictToolFailureSchema)`, so a
success result with a `status` field (cloud drive's `status: 'ok'`) isn't mistaken for a failure.
It returns the parsed value. On a parse error it logs the zod issues with the existing log fields
and throws `ToolExecutionError`.

**Adapters.**

- AI SDK (`toAgentTools`): `outputSchema: definition.outputSchema.or(toolFailureSchema)`. The AI
  SDK types `outputSchema` as everything `execute` returns, failures included.
- MCP (`registerMcpTool`): `outputSchema: definition.outputSchema`. The SDK skips the check for
  `isError` results, so failures need no schema.

**Moving the tools.** Each tool file declares `<tool>OutputSchema` next to its input schema, as
`webSearch` does. Nested shapes reuse existing zod DTOs where one exists. `imageGen`'s output
type stays exported from `@repo/ai/client` as `z.infer`.

## Extension points

- **Axis:** the tool. A new tool declares `inputSchema` and `outputSchema`; the runner and both
  adapters need no change.
- **Faked in tests:** tool runner tests define small inline `ToolDefinition`s.
- **Not abstracted:** no schema registry or codegen. Each tool file owns its schemas.
- **Packages considered:** none needed; zod 4 and both SDKs already accept zod schemas.
