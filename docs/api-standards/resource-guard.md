# Resource guard: workspace-scoped references

**Status: proposed** (2026-10-05). Follow-up to the API review fixed in PR #61.

## Problem

Path params are safe. Every `/workspace/:workspaceId/...` route goes through
`workspaceGuard`, and every service loads its resource with a workspace-scoped
repository call.

IDs that arrive in a **body or tool input** are a different story. They point
at a second resource (an agent, a folder, a label), and nothing checks that
this second resource lives in the same workspace. The database only has plain
foreign keys to `id`, so any existing id is accepted.

PR #61 fixed one instance (chat `agentId`, which leaked another tenant's agent
prompt, context and memory). The same pattern is still open elsewhere, and it
is not limited to the HTTP API: the AI agent tools write the same columns, and
an agent can be steered by prompt injection (for example through email
content).

A second, quieter issue: lookups are scoped inconsistently. Some repositories
scope by `workspaceId`, others by `userId`. Today a workspace has exactly one
owner, so user scope equals "any of my workspaces". The moment a workspace has
members, every user-scoped lookup becomes a leak.

## Inventory

Every body/tool-input id that references another resource, across all write
paths (HTTP API, AI tools, MCP tools, worker).

| Reference | Entry points | Today |
| --- | --- | --- |
| chat `agentId` | API | Scoped (PR #61) |
| gen-image/gen-video `genImageId`, upload `mediaId` | API | Scoped (PR #61) |
| task `parentTaskId`, `afterTaskId` | API, tools | Scoped |
| dataset `afterRowId`, chat branch `messageId` | API | Scoped |
| email `threadId`, `draftId`, `replyToMessageId`, `mediaId` | API | Scoped to the user's email account |
| email `agentId`, `defaultAgentId` | API | User-scoped by design (email is per-user) |
| task `labelIds` | API | **Unchecked** (tools resolve labels by name in the workspace) |
| task `assignedAgentId` | API, AI tool (`task.tools.ts`) | **Unchecked** |
| document `folderId` | API, AI tool (`document.tools.ts`) | **Unchecked** |
| agent `defaultDatasetId` | API | Not checked on save; the read is user-scoped (`getDatasetById({ userId })`) |
| workflow definition `agentId`s | API (save), worker (run) | Not checked on save; the run is user-scoped (`getAgentById({ userId })`) |

This table is the checklist. A new body/tool-input id field gets a row here
and a cross-tenant test before it ships.

## Goals

- One guard that every write path can call: API services, AI tools, MCP tools,
  worker.
- The workspace is the single scoping rule for workspace resources.
- A cross-tenant test per reference, so a missing check fails CI.
- Clear errors: 404 on the API, `{ error }` in tools.

## Non-goals

- Path params. Already covered by `workspaceGuard` plus scoped repository
  calls.
- Email. It is per-user by design (docs/email/prd.md) and stays user-scoped.
- Workspace members and roles. This design only makes them safe to add later.
- Database-level composite foreign keys (see "Considered: composite foreign
  keys").

## Design

### 1. `assertWorkspaceReferences` in `@repo/database`

It lives in `@repo/database` because it is the one package every write path
already depends on. `apps/api` would be out of reach for `@repo/ai` and the
worker.

```ts
export interface WorkspaceReferences {
  agentIds?: readonly (string | null | undefined)[];
  datasetIds?: readonly (string | null | undefined)[];
  folderIds?: readonly (string | null | undefined)[];
  taskLabelIds?: readonly (string | null | undefined)[];
}

export async function assertWorkspaceReferences(
  { workspaceId, references }: { workspaceId: string; references: WorkspaceReferences },
  tx?: Transaction,
): Promise<void>;
```

Behavior:

- Drops `null`/`undefined` (a cleared reference is always allowed) and
  dedupes.
- One query per resource type with ids:
  `SELECT id FROM <table> WHERE id IN (...) AND workspace_id = $1`.
  A `labelIds` array of 10 is one query, not 10.
- If any id is missing from the result, throws
  `ForeignReferenceError { resource, ids }` listing the offending ids.
- Accepts an optional transaction, so a write can check and insert in one
  transaction.

The resource-to-table mapping is one record inside the function. Adding a
resource type means one entry there plus one field on `WorkspaceReferences`.

`ForeignReferenceError` sits next to `isUniqueViolationError` in
`packages/database/src/errors.ts`, with an `isForeignReferenceError` guard for
the same `instanceof` reason documented there.

### 2. Callers

| Caller | Change |
| --- | --- |
| `task.service.ts` create/update | `agentIds: [assignedAgentId]`, `taskLabelIds: labelIds` |
| `document.service.ts` create/update | `folderIds: [folderId]` |
| `agent.service.ts` create/update | `datasetIds: [defaultDatasetId]` |
| `workflow.service.ts` create/update | `agentIds:` every agent id in the definition |
| `task.tools.ts` update | `agentIds: [assignedAgentId]` |
| `document.tools.ts` create | `folderIds: [folderId]` |

`chat.service.ts` keeps its `getAgentForWorkspace` check from PR #61. It needs
the agent row anyway, so a second call would add nothing.

Error mapping:

- API services map `ForeignReferenceError` to `NotFoundException('<Resource>
  not found')`, matching PR #61 (chat agent) and the gen-image reference
  check.
- Tools return `{ error: '<Resource> not found.' }`, matching the existing
  tool error shape.

### 3. Workspace scope everywhere

Move the user-scoped lookups of workspace resources to workspace scope:

| Today | Becomes |
| --- | --- |
| worker `run-referenced-agent.ts`, `team.executor.ts`: `getAgentById({ agentId, userId })` | `getAgentByIdAndWorkspaceId({ agentId, workspaceId })` |
| `@repo/ai` `agent.service.ts` `loadPinnedDataset`: `getDatasetById({ datasetId, userId })` | workspace-scoped dataset lookup |
| `dataset.tools.ts` `loadDatasetInScope`: user lookup plus `isDatasetInScope` | one workspace-scoped lookup |

Email keeps `getAgentById({ userId })` (per-user by design). After this,
`getAgentById` and `getDatasetById` with `userId` should have no workspace
callers left. Remove them if nothing else needs them.

Existing data: a workflow or agent saved before this change can hold a
reference into another workspace of the same owner. Section 3 makes that
reference fail at run time with "not found" instead of silently working. Run
a one-off query before deploy to list such rows (expected: none or very few),
and fix them by hand.

### 4. Tests

One cross-tenant test per inventory row marked unchecked or not checked on
save: user B's resource id in user A's request, expect 404 (API) or a tool
error (tools). Tests stay in their domain folders (`test/task`,
`test/document`, `test/agent`, `test/workflow`), not in one cross-cutting
file. The inventory table above is the index of those cases.

## Considered: composite foreign keys

Example: `(workspace_id, assigned_agent_id) REFERENCES agent(workspace_id, id)`.
The database would reject a foreign reference from any writer, including code
that does not exist yet.

Deferred, because:

- Nullable references with `ON DELETE SET NULL` would also null
  `workspace_id`. Postgres 15 `SET NULL (column)` fixes that, but Drizzle does
  not model it, so drizzle-kit would keep reporting drift.
- Join tables (`task_to_label`) have no `workspace_id` column yet.
- Every referenced table needs a `UNIQUE (workspace_id, id)`.
- The migration fails on existing bad rows, so section 3's cleanup query has
  to run first anyway.

Worth revisiting for non-null or cascade references (for example
`chat.agent_id`) once the guard is in place.

## Rollout

1. `assertWorkspaceReferences`, `ForeignReferenceError`, repository queries
   (`@repo/database`, rebuild).
2. API callers plus cross-tenant tests (task, document, agent, workflow).
3. Tool callers (`@repo/ai`, rebuild).
4. Workspace scope unification (worker, `@repo/ai`), after the data check.

Steps 2 and 3 can run in parallel once step 1 is built.

## Open questions

1. 404 or 422 for a foreign body reference? This doc proposes 404, to match
   PR #61 and to not reveal that the id exists elsewhere.
2. Should workflow saves validate agent ids (section 2), or only runs
   (section 3)? Validating on save gives the user an error while editing; the
   run check stays as the backstop either way.
