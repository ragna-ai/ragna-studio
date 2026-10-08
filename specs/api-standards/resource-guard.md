# Resource guard: workspace-scoped references

**Status: implemented** (PR #90, 2026-10-08). Composite foreign keys enforce that a reference never
leaves its workspace. Follow-up to the API review fixed in PR #61. Prerequisite for
workspace members and RBAC.

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

The checks that do exist live in the callers, not at the write. The API and
the task tool share `updateTask` in `task.repo.ts`, but each validates the
parent task with its own function, and neither checks `assignedAgentId`.
Every new caller (MCP, worker, the next tool) has to remember every rule.

A second issue: lookups are scoped inconsistently. Some repositories scope by
`workspaceId`, others by `userId`. Today a workspace has exactly one owner, so
user scope equals "any of my workspaces". Once workspaces have members, every
user-scoped lookup of a workspace resource becomes a leak.

## Inventory

Every body/tool-input id that references another resource, across all write
paths (HTTP API, AI tools, MCP tools, worker).

| Reference                                                  | Entry points                       | Today                                                                       | Fix in this doc          |
| ---------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- | ------------------------ |
| chat `agentId`                                             | API                                | Scoped (PR #61)                                                             | Later candidate          |
| gen-image/gen-video `genImageId`, upload `mediaId`         | API                                | Scoped (PR #61)                                                             | n/a                      |
| task `parentTaskId`, `afterTaskId`                         | API, tools                         | Scoped                                                                      | Later candidate          |
| dataset `afterRowId`, chat branch `messageId`              | API                                | Scoped                                                                      | n/a                      |
| email `threadId`, `draftId`, `replyToMessageId`, `mediaId` | API                                | Scoped to the user's email account                                          | n/a (per-user)           |
| email `agentId`, `defaultAgentId`                          | API                                | User-scoped by design (email is per-user)                                   | n/a (per-user)           |
| task `labelIds`                                            | API                                | **Unchecked** (tools resolve labels by name in the workspace)               | Composite FK             |
| task `assignedAgentId`                                     | API, AI tool (`task.tools.ts`)     | **Unchecked**                                                               | Composite FK             |
| document `folderId`                                        | API, AI tool (`document.tools.ts`) | **Unchecked**                                                               | Composite FK             |
| agent `defaultDatasetId`                                   | API                                | Not checked on save; the read is user-scoped (`getDatasetById({ userId })`) | Composite FK + section 5 |
| workflow definition `agentId`s                             | API (save), worker (run)           | Not checked on save; the run is user-scoped (`getAgentById({ userId })`)    | App check + section 5    |

A new body/tool-input id field gets a row here and a cross-tenant test before
it ships.

## Goals

- The database rejects a reference into another workspace, from every writer
  (API, AI tools, MCP tools, worker, code that doesn't exist yet).
- No extra queries for the check.
- The workspace is the single scoping rule for workspace resources.
- A cross-tenant test per reference, so a missing check fails CI.
- Clear errors: 404 on the API, `{ error }` in tools.

## Non-goals

- Path params. Already covered by `workspaceGuard` plus scoped repository
  calls.
- Email. It is per-user by design (specs/email/prd.md) and stays user-scoped.
  Email tables have no `workspace_id`.
- Workspace members and RBAC. This design makes them safe to add: members
  only has to change how `workspaceGuard` decides access.
- Postgres row-level security (see "Considered: row-level security").

## Design

### Rule: a reference never leaves its workspace

Every workspace resource belongs to exactly one workspace (the container
model, specs/api-standards/prd.md). A reference from one workspace resource
to another always points into the same workspace. The database enforces this
with a composite foreign key that includes `workspace_id` on both sides:

```sql
FOREIGN KEY (workspace_id, assigned_agent_id) REFERENCES agents (workspace_id, id)
```

The check happens inside the INSERT or UPDATE, during the index lookup the
plain foreign key already does. It costs no extra query. A `NULL` reference
is not checked (`MATCH SIMPLE`, the default), so clearing a reference always
works.

A resource's `workspace_id` never changes after insert. Moving resources
between workspaces is deferred, and would be "duplicate with remap" anyway.

Shared resources across an organization, if they come, are modeled as their
own org-scoped tables that workspaces copy from or reference with an org
check, like `agent_template` today. A foreign key from one workspace into
another is never the answer.

### 1. Schema

| Referencing column                                   | Referenced                       | Delete behavior (unchanged for users)     |
| ---------------------------------------------------- | -------------------------------- | ----------------------------------------- |
| `tasks (workspace_id, assigned_agent_id)`            | `agents (workspace_id, id)`      | Agent delete clears it (was `SET NULL`)   |
| `tasks_to_task_labels (workspace_id, task_id)`       | `tasks (workspace_id, id)`       | `CASCADE`                                 |
| `tasks_to_task_labels (workspace_id, task_label_id)` | `task_labels (workspace_id, id)` | `CASCADE`                                 |
| `documents (workspace_id, folder_id)`                | `folders (workspace_id, id)`     | Folder delete clears it (was `SET NULL`)  |
| `agents (workspace_id, default_dataset_id)`          | `datasets (workspace_id, id)`    | Dataset delete clears it (was `SET NULL`) |

Supporting changes:

- `UNIQUE (workspace_id, id)` on `agents`, `tasks`, `task_labels`, `folders`,
  `datasets`. A composite foreign key needs a unique target.
- `tasks_to_task_labels` gets a `workspace_id` column (`NOT NULL`, backfilled
  from `tasks`). `replaceTaskLabels` and `createTask` write it.
- The composite foreign key **replaces** the plain one on each column. Keeping
  both is not an option: Postgres fires the plain `SET NULL` and the
  composite check in trigger-name order. A probe on Postgres 18 showed the
  same delete passing in one creation order and failing in the other.
- Constraint names are explicit and follow one pattern, for example
  `tasks_assigned_agent_workspace_fk`. Error mapping (section 3) reads them.

### 2. Deletes: `NO ACTION`, cleared by the repository

Postgres 15 can do `ON DELETE SET NULL (assigned_agent_id)`, which nulls the
reference but keeps `workspace_id`. Drizzle can't model the column list
(issue #5684, open; checked in 1.0.0-rc.4 and the rc.5 preview), and it
can't model deferrable foreign keys either (issue #3331, closed without
support). Hand-written SQL in a custom migration would work, but drizzle-kit
wouldn't know about it and later generated migrations could drop or recreate
the constraint. So the nullable references use `NO ACTION`, and the one
delete function per table clears references first, in the same transaction:

| Delete function                       | Clears first                |
| ------------------------------------- | --------------------------- |
| `agent.repo.ts` `deleteAgentById`     | `tasks.assigned_agent_id`   |
| `folder.repo.ts` `deleteFolderById`   | `documents.folder_id`       |
| `dataset.repo.ts` `deleteDatasetById` | `agents.default_dataset_id` |

`NO ACTION`, never `RESTRICT`. Deleting a workspace cascades into agents and
tasks in the same statement. `NO ACTION` checks at the end of that statement,
when both are gone. `RESTRICT` checks immediately and would break workspace
deletion. A probe confirmed workspace deletion cascades cleanly with the
composite keys in place.

A delete path that forgets to clear fails with a foreign key error. That is a
safe failure (a 500 and a log line), never a leak.

### 3. Error mapping

A rejected reference surfaces as Postgres error `23503` (foreign key
violation) with the constraint name.

`packages/database/src/errors.ts` gets `getForeignReferenceResource(error)`,
next to `isUniqueViolationError` and for the same `instanceof` reason
documented there. It returns the resource name for a known composite
constraint (`'agent'`, `'taskLabel'`, `'folder'`, `'dataset'`), or `null`
otherwise.

- **API services** wrap repository calls in `tryCatch` and turn any error
  into a 500, so `app.ts`'s `onError` never sees the original error. Create
  and update paths check `getForeignReferenceResource(error)` and throw
  `NotFoundException('<Resource> not found')`, the same way services already
  handle `isUniqueViolationError`. Delete paths never map it: there, a `23503`
  means a delete function forgot to clear a reference, which is a bug.
- **AI tools** catch the error in their existing `tryCatch` and return
  `{ error: '<Resource> not found.' }` via the same helper, instead of the
  raw Postgres message.
- **MCP tools** go through the same `ToolDefinition` execute functions and
  behave like the AI tools.

### 4. Workflow definitions: app check

Workflow agent ids live inside the `definition` JSON, where foreign keys
can't reach. `createWorkflow` and `updateWorkflow` check them with one query
before writing:

```sql
SELECT id FROM agents WHERE id IN (...) AND workspace_id = $1
```

Scope is compared in SQL, never by loading rows and comparing in JS. If the
count is short, the write fails with `'Agent not found'` and a 404. The ids
come from a small `getWorkflowAgentIds(definition)` function in
`@repo/workflow`, next to the definition schema.

### 5. Workspace scope everywhere

Move the user-scoped lookups of workspace resources to workspace scope. This
is also the groundwork for members: after it, no workspace resource is found
by `userId`.

| Today                                                                                      | Becomes                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| worker `run-referenced-agent.ts`, `team.executor.ts`: `getAgentById({ agentId, userId })`  | `getAgentByIdAndWorkspaceId({ agentId, workspaceId })` |
| `@repo/ai` `agent.service.ts` `loadPinnedDataset`: `getDatasetById({ datasetId, userId })` | workspace-scoped dataset lookup                        |
| `dataset.tools.ts` `loadDatasetInScope`: user lookup plus `isDatasetInScope` in JS         | one workspace-scoped lookup                            |
| `dataset.repo.ts` `updateDatasetRow`, `deleteDatasetRow`: `getDatasetById({ userId })`     | workspace-scoped                                       |

Email keeps `getAgentById({ userId })` (per-user by design). After this,
`getDatasetById` with `userId` has no callers left and is removed.
`getAgentById` stays for email only.

### 6. Migration

Self-hosted installs can't be fixed by hand, so the migration cleans up by
itself. Rows that point into another workspace are leaks, so clearing them
loses nothing a user should have had.

Order, in one migration directory sequence (`db:generate` plus a
`drizzle-kit generate --custom` step for the data part):

1. Add `tasks_to_task_labels.workspace_id` (nullable) and the
   `UNIQUE (workspace_id, id)` constraints.
2. Data: backfill `tasks_to_task_labels.workspace_id` from `tasks`. Delete
   join rows whose label is in another workspace. Null `assigned_agent_id`,
   `folder_id` and `default_dataset_id` where the target is in another
   workspace. Report the counts with `RAISE NOTICE`.
3. Set `tasks_to_task_labels.workspace_id` to `NOT NULL`. Drop the plain
   foreign keys and add the composite ones.

Workflow definitions and section 5 need no migration. A workflow that points
at an agent in another workspace of the same owner fails at run time with
"not found" after section 5. Before deploy, run a one-off query on
production that lists such workflows (expected: none or very few). It checks
both the draft and the published definition:

```sql
SELECT DISTINCT w.id AS workflow_id, w.workspace_id, found.agent_id
FROM workflows w
CROSS JOIN LATERAL (VALUES (w.definition), (w.published_definition)) AS d(definition)
CROSS JOIN LATERAL (
  SELECT jsonb_path_query(d.definition, '$.nodes[*].data.config.agentId') #>> '{}' AS agent_id
  UNION ALL
  SELECT jsonb_path_query(d.definition, '$.nodes[*].data.config.leadAgentId') #>> '{}'
  UNION ALL
  SELECT jsonb_path_query(d.definition, '$.nodes[*].data.config.members[*].agentId') #>> '{}'
) AS found
WHERE NOT EXISTS (
  SELECT 1 FROM agents a WHERE a.id = found.agent_id AND a.workspace_id = w.workspace_id
)
ORDER BY w.id;
```

### 7. Tests

Test-driven, per the repo's TDD rule for `apps/api` and the packages it
reaches. Each test must fail against today's code before the fix lands.

- **Cross-tenant, per reference:** user B's resource id in user A's request.
  Expect 404 (API) or a tool error (tools). Covers task `assignedAgentId` and
  `labelIds`, document `folderId`, agent `defaultDatasetId`, workflow agent
  ids. Tests stay in their domain folders (`test/task`, `test/document`,
  `test/agent`, `test/workflow`). The inventory table is their index.
- **Same owner, other workspace:** the same cases with a second workspace of
  user A. This is the case members turns into a real leak.
- **Deletes keep working:** deleting a referenced agent, folder and dataset
  succeeds and clears the reference. Deleting a workspace with references
  inside it succeeds.
- **Section 5:** per lookup, a resource from another workspace of the same
  owner is not found.

## Members and RBAC

This design is the first step; members builds on it.

- Members changes how `workspaceGuard` grants access: a membership row
  instead of `workspace.ownerId = user.id`. Repositories and constraints keep
  working on `workspace_id` and don't change.
- The planned model: an organization has many users, a user has many
  workspaces. Workspaces stay the containers. Nothing in that model needs a
  reference across workspaces.
- RBAC (what a member may do: viewer, editor, admin) is app-level and gets
  its own design. It answers "may this user perform this action", which is
  not a row-scoping question.
- Section 5 must ship before members. Otherwise every user-scoped lookup
  leaks across shared workspaces.
- Caching `workspaceGuard`'s access check (it runs on every request) belongs
  in the members design, where the guard query changes anyway.

## Considered: app-level reference check

A helper in every repository write, running
`SELECT id FROM <table> WHERE id IN (...) AND workspace_id = $1` per
resource type. It works, and section 4 uses it for workflow JSON. Rejected
for columns: it costs a query per resource type per write, and it only
protects writes that remember to call it.

## Considered: row-level security

Postgres RLS would add a database-level filter on every query. Its strongest
point is defense in depth: a forgotten `workspaceId` filter can't leak.
Rejected for now:

- **Superuser connection.** The app connects as `postgres`. Superusers always
  bypass RLS, even with `FORCE ROW LEVEL SECURITY`. RLS needs a separate
  restricted role, and every self-hosted install would need a migration that
  creates it and switches `DATABASE_URL`.
- **Foreign keys bypass RLS.** Postgres runs referential integrity checks
  without row security. A foreign `assigned_agent_id` would still be
  accepted, so RLS alone doesn't fix the problem in this doc.
- **Round trips.** RLS needs the user and workspace set on the connection
  (`set_config(..., true)`). With the `node-postgres` pool, every unit of
  work then has to be a transaction: about 3 extra round trips each.
  Wrapping a whole request in one transaction doesn't work, because chat
  streams and agent tool loops hold it open for minutes and exhaust the pool.
- **Worker.** Crons (task reminders, cleanup, media sweep, email sync) read
  across all workspaces. They would need a second, RLS-bypassing role and
  `db` instance.
- **RBAC stays in the app anyway.** RLS scopes rows; it can't express
  "viewers may not delete".
- **Tests** run as superuser and would silently pass.

Worth revisiting as an extra layer once members and RBAC have settled.

## Later candidates

Same pattern, not needed for the open leaks, so not in this doc:

- `chats (workspace_id, agent_id)`: `CASCADE`, so no delete change. Would
  make PR #61's app check redundant.
- `tasks (workspace_id, parent_task_id)`: self-reference. `deleteTask` would
  clear subtasks' parent first.
- `tasks.created_by_agent_id`, `documents.created_by_agent_id`: written from
  the tool context, not from input.
- Child tables without `workspace_id` (task attachments, dataset rows,
  agent context documents) reach their workspace through the parent and
  stay as they are.

## Parked

- **Schema-lint test.** A test that walks Drizzle's foreign keys and fails
  when a foreign key between two workspace tables isn't composite. Cheap
  once this ships; decide then.
- **Branded workspace id type.** Friction with Drizzle's inferred types
  outweighs the gain.

## Decisions

1. A foreign body reference returns **404**, not 422. It matches PR #61 and
   doesn't reveal that the id exists elsewhere.
2. Saving a workflow with an agent id outside the workspace **fails** with 404. It is not just a warning in the editor. The run stays
   workspace-scoped (section 5) as the backstop.
3. Composite foreign keys over an app-level helper and over RLS
   (2026-10-08).

## References

Checked 2026-10-08.

- Postgres `CREATE TABLE` (`SET NULL (columns)` is `ON DELETE` only,
  `NO ACTION` vs `RESTRICT`, `MATCH SIMPLE`, unique target required):
  https://www.postgresql.org/docs/current/sql-createtable.html
- Postgres 15 release notes, column lists for `ON DELETE SET` actions:
  https://www.postgresql.org/docs/15/release-15.html
- Postgres row security (superusers bypass even with `FORCE`, referential
  integrity checks bypass RLS):
  https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Drizzle composite foreign keys (`foreignKey({ columns, foreignColumns, name })`):
  https://orm.drizzle.team/docs/indexes-constraints
- Drizzle issue #5684, `ON DELETE SET NULL (column_list)`:
  https://github.com/drizzle-team/drizzle-orm/issues/5684
- Drizzle issue #3331, deferrable foreign keys:
  https://github.com/drizzle-team/drizzle-orm/issues/3331
- Local probe on Postgres 18 (dev container, throwaway schema): plain
  `SET NULL` plus composite foreign key on the same column passes or fails
  depending on creation order; composite `NO ACTION` with workspace cascade
  and null-then-delete both work.

## Rollout

Test-driven throughout. Every step starts with failing tests, then the
implementation makes them pass.

1. Cross-tenant and same-owner tests for task, document and agent (red).
   Then schema, migration, delete functions and
   `getForeignReferenceResource` (`@repo/database`, rebuild), plus the
   service and tool error mapping.
2. Delete tests (agent, folder, dataset, workspace). Written in step 1 so the
   delete changes land together with the constraints.
3. Workflow tests (red), then `getWorkflowAgentIds` and the save check
   (`@repo/workflow`, `@repo/database`).
4. Production data check for workflows. Then, per lookup in section 5: a
   test (red), then the switch to workspace scope (worker, `@repo/ai`,
   `@repo/database`).
5. Members PRD builds on the result.

## Implementation slices

| Slice         | Wave | Scope                                                                                    |
| ------------- | ---- | ---------------------------------------------------------------------------------------- |
| `rg-fk`       | 1    | Sections 1, 2, 3, 6; section 7 tests for task, document, agent                           |
| `rg-scope`    | 1    | Section 5 and its tests (worker and `loadPinnedDataset` untested: no harness)            |
| `rg-workflow` | 2    | Section 4 and its tests; production data-check query for workflows. Starts after `rg-fk` |

Pinned contract, owned by `rg-fk`, extended by `rg-workflow`:

```ts
export type ForeignReferenceResource = 'agent' | 'taskLabel' | 'folder' | 'dataset';
export function getForeignReferenceResource(error: unknown): ForeignReferenceResource | null;
```

Shared file: `dataset.repo.ts`. `rg-fk` owns `deleteDatasetById`; `rg-scope`
owns `updateDatasetRow`, `deleteDatasetRow` and the `getDatasetById` removal.
