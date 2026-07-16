# Workspaces: known issues

See [workspaces.md](./workspaces.md) for the v1 design this refers to.

## Agent-tool-created resources never get a `workspaceId` (fixed)

Was a confirmed bug (v1 gap, not a regression from any single commit). Resources created by the chat agent's tools (e.g. `linkedinDraft`, which creates a `socialPost`) were always inserted with `workspaceId: null`, regardless of which workspace the chat belongs to or which workspace is active client-side. The "Create flows" behavior described in the base doc only held for direct UI create endpoints (e.g. `POST /social-posts`); it did not hold for the agent-tool path.

**Fixed by threading `workspaceId` end-to-end:**

- `packages/database/src/repositories/chat.repo.ts` — `getChatByIdForUser`'s `columns` allowlist now includes `workspaceId`.
- `apps/api/src/controllers/chat.controller.ts` — the chat POST handler now passes `workspaceId: userChat.workspaceId ?? undefined` into `tools(dataStream, { userId, agentId, workspaceId })`.
- `packages/ai/src/tools/agent.tools.ts`, `image-gen.tool.ts`, `linkedin-draft.tool.ts`, `imagen.service.ts`, `social-post.service.ts` — `workspaceId` threaded through `AgentToolDeps` into both tool factories and their underlying create calls.
- `apps/worker/src/workflow/executors/types.ts`, `engine.ts`, `tool.executor.ts` — `ExecutorContext` now carries `workspaceId` (sourced from `run.workflow.workspaceId`), threaded into `buildAgentTools` for the workflow-triggered tool path.
- `AgentToolDeps.workspaceId` was made required (`string | null`, matching the DB column's nullability, instead of an optional `string`) rather than converting `null` to `undefined` at each boundary. That immediately surfaced a third, previously undocumented instance of this bug: `apps/worker/src/workflow/executors/agent.executor.ts` (the workflow "agent" node type, not the "tool" node type) called `tools(noopWriter, { userId, agentId })` with no `workspaceId` at all. Fixed the same way.

**Previous user-visible effect:** asking the agent (in a chat that belongs to workspace A) to draft a LinkedIn post created the post as "unassigned"; it did not show up when the user was scoped to workspace A (or any named workspace), only under the "Unassigned" filter. Per the "no data leaks" core principle this was never a security issue (still fenced by `userId`), just a functional one: the item silently vanished from the workspace the user was actually working in.
