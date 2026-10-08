# Moving resources between workspaces

**Status: deferred (2026-07-30). Not implemented, no work planned.**

Both [workspaces.md](./workspaces.md) ("Future phases") and
[specs/api-standards/prd.md](../api-standards/prd.md) ("Out of scope") list a
"move to workspace" action as the natural fast-follow to the container model.
This document records what an implementation actually has to deal with, and
why it was judged too complex to be worth building now.

The short version: the operation looks like `UPDATE ... SET workspace_id = ?`,
and for about half the resources that is genuinely all it is. The other half
either fail on a unique index, lose data through a cascade, or keep working
while silently pointing at the wrong workspace.

## What makes it non-trivial

### Storage is not a problem

R2 keys are user-scoped, not workspace-scoped
(`packages/storage/src/lib/image-urls.ts:3`, `video-urls.ts:5`). Workspaces
are single-owner, so a move never crosses an owner boundary and no object
ever has to be copied or re-keyed. This applies to generated images, videos,
social post media, and agent context documents.

### Three unique indexes reject the UPDATE outright

| Index | Table | Collision |
| --- | --- | --- |
| `task_workspaceId_number_idx` on `(workspaceId, number)` | `task.schema.ts:72` | Tasks carry a per-workspace sequence shown as `TSK-<number>`. Moving TSK-7 into a workspace that already has one throws. Renumbering to `max(number)+1` fixes it but changes the task's visible id. |
| `taskLabel_workspaceId_name_idx` on `(workspaceId, name)` | `task.schema.ts:96` | Two workspaces both having a "bug" label is normal, so this collides often. |
| `agent_default_per_workspace_idx` on `(userId, workspaceId) WHERE isDefault` | `agent.schema.ts:106` | Moving a default agent into a workspace that already has one throws. Moving it out leaves the source workspace with no default agent. |

### One cascade turns a dangling reference into data loss

`chat.agentId` is `NOT NULL` with `onDelete: 'cascade'`
(`chat.schema.ts:19`). Nothing constrains the agent to be in the chat's
workspace, so swapping a chat's `workspaceId` succeeds and leaves the chat
pointing at an agent back in the source workspace.

Delete that source workspace later and the agent cascades, taking the chat
with it. A chat disappears from a workspace the user never touched.

### Workflows break the container invariant with no signal at all

This is the worst case, and the reason the feature was deferred rather than
scoped down.

Workflow definitions embed agent ids in jsonb, so there is no foreign key,
no cascade, and no error. Three places in
`packages/workflow/src/config.schema.ts`:

- `agentConfigSchema.agentId` (line 28, optional)
- `delegateTeamConfigSchema.leadAgentId` (line 74, optional, falls back to
  the default agent)
- `teamMemberSchema.agentId` (line 66, required, up to 5 per team node)

Each appears in **two** columns, `definition` (draft) and
`publishedDefinition` (execution snapshot). Both would need scanning.

The executor then resolves those ids without any workspace check:

```ts
// apps/worker/src/workflow/executors/team.executor.ts:189
const agentRecord = await getAgentById({ agentId: leadAgentId, userId: ctx.userId });
```

Scoped by `userId`, not `workspaceId`. `getDefaultAgent()`
(`agent.executor.ts:25`) takes no arguments at all, so the unset-`agentId`
fallback is not workspace-scoped either.

Consequence: a moved workflow keeps executing the source workspace's agents
indefinitely. No FK violation, no runtime error, no visible difference on the
canvas. Every other resource at least fails loudly or renders visibly wrong.

`workflowRun.definition` snapshots are historical and should keep their
original agent ids regardless. That is a record of what actually ran.

### Soft references that go quietly wrong

No error, the UI is just subtly incorrect:

- `document.folderId` (`document.schema.ts:25`) points at a folder in the old
  workspace, so the document never appears in the target's folder tree.
- `agent.defaultDatasetId` (`agent.schema.ts:87`) keeps reading a dataset
  from the old workspace.
- Task label pivot rows reference labels absent from the target's label list.
- `task.assignedAgentId` and `task.createdByAgentId` (`task.schema.ts:59`,
  `:65`) point across workspaces.

## Per-resource cost, if it were built

| Resource | Beyond the `workspaceId` UPDATE |
| --- | --- |
| `genImage`, `genVideo` | nothing |
| `socialPost` | nothing (`socialPostMedia` follows by cascade) |
| `document` | null `folderId` so it lands at root |
| `folder` | move its documents too |
| `dataset` | null `defaultDatasetId` on agents left behind |
| `task` | renumber, drop or remap labels, null agent refs |
| `taskLabel` | rename on collision |
| `agent` | handle `isDefault`, decide the fate of its chats |
| `chat` | needs an agent in the target, `agentId` cannot be nulled |
| `workflow` | scan both jsonb columns, remap or block, prevent silent wrong execution |

Child rows carry no `workspaceId` of their own and follow their parent for
free: `chatMessage`, `agentMemory`, `agentContextDocument`, `datasetRow`,
`workflowRun`, `workflowRunStep`, `socialPostMedia`.

`creditUsageEvent.workspaceId` (`credit.schema.ts:52`) is a ledger and must
never move. History stays where it was spent.

## Why it was deferred

The resources that are cheap to move are the ones users care least about
relocating. The resources users would actually want to move, agents and
workflows, are exactly the two where a move is not a move.

- An **agent** has inbound references from chats, tasks and documents, plus a
  unique `isDefault` constraint per workspace.
- A **workflow** depends on agents that must already exist in the target,
  through references no constraint can check.

For both, the honest operation is **duplicate into workspace with a remap
step**, not a move. That is a materially larger feature than the one-column
UPDATE the roadmap notes imply, and it needs its own PRD.

## Approach sketch, if revisited

Recorded so the analysis above is not re-derived from scratch.

- **Endpoint**: `POST /workspace/:workspaceId/<resource>/:resourceId/transfer`
  with `{ targetWorkspaceId }`. Note `/move` is already taken with unrelated
  meaning by dataset row reorder (`dataset.controller.ts:209`) and task
  kanban move (`task.controller.ts:117`).
- **Both workspaces must be authorized.** `workspaceGuard` covers the source
  via the URL. The `targetWorkspaceId` in the body needs its own ownership
  check in the service. Without it a user can push a resource into someone
  else's workspace. This is the only real security surface in the feature.
- **One transaction per move**, since a move touches the row plus its
  referencing rows.
- **Agents and workflows are duplicate-with-remap**, not move.
- A phased scope would start with the leaves (`document`, `folder`,
  `genImage`, `genVideo`, `socialPost`) and stop there until the agent and
  workflow story is designed.

## Related gap, independent of this feature

The workflow executor does not verify that a referenced agent belongs to the
workflow's workspace (`team.executor.ts:189`, `agent.executor.ts:25`). Today
nothing creates such a mismatch, so the bug is latent. Passing `workspaceId`
into `getAgentById` and `getDefaultAgent` would close it, and is worth doing
whether or not moving resources is ever built.
