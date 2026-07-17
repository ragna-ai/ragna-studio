# Workflows: known issues

See [workflows.md](./workflows.md) and [workflows-implementation.md](./workflows-implementation.md) for the design this refers to.

## `executeTool`'s `buildAgentTools` call references a non-existent `ctx.agentId`

`apps/worker/src/workflow/executors/tool.executor.ts` builds its toolset with:

```ts
const toolset = buildAgentTools(noopWriter, {
  userId: ctx.userId,
  agentId: ctx.agentId,
  workspaceId: ctx.workspaceId,
});
```

`ctx` is `ExecutorContext` (`apps/worker/src/workflow/executors/types.ts`), which only declares `{ input, userId, workspaceId }`. There is no `agentId` field, so `ctx.agentId` is a type error ("Property 'agentId' does not exist on type 'ExecutorContext'").

**Root cause:** workflow "tool" nodes have no associated agent at all. `ToolConfig` (`packages/workflow/src/config.schema.ts`) only carries `{ tool, input }`, no `agentId`. Contrast with the workflow "agent" node type (`executeAgent` in `agent.executor.ts`), which does have a real per-node `config.agentId` and passes that directly to `tools()`, not via `ctx`.

`AgentToolContext.agentId` (`packages/ai/src/tools/agent.tools.ts`) is currently required (`string`), because `getMemoryTool(writer, agentId)` (`packages/ai/src/tools/memory.tool.ts`) requires a real agent id to scope memory reads/writes. The `memory` tool is unconditionally constructed by the `tools()` factory regardless of which tool a caller actually needs, and it happens to be unreachable from a workflow tool node in practice, since `'memory'` isn't in `WORKFLOW_TOOLS` (`['think', 'webSearch', 'webBrowser', 'imageGen', 'linkedinDraft']`) and can never be selected as `config.tool`. But that's not visible to the type checker, so the call still fails to compile.

**Considered fix (not applied, reverted on request):** make `AgentToolContext.agentId` and `getMemoryTool`'s param `string | null`, add `agentId: string | null` to `ExecutorContext` (set to `null` in `engine.ts`, since there's no run-level agent), and have `getMemoryTool` return an error result if invoked with `null` (defensive, since it should be unreachable via `WORKFLOW_TOOLS` today). This was implemented and then reverted at the user's request.

**Fixed** Rather than making `agentId` nullable, the workflow `tool.executor.ts` stopped using `@repo/ai`'s `tools()` altogether. A new, independent `workflowTools` implementation now lives in `packages/workflow/src/tools`.
