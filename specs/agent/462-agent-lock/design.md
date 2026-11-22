# Agent lock: design

Issue #462. Stories in [prd.md](./prd.md).

## Data model

New table `agent_versions`, registered in `relations.ts`.

| Column                               | Type              | Notes                                                                     |
| ------------------------------------ | ----------------- | ------------------------------------------------------------------------- |
| `id`                                 | text              | uuidv7                                                                    |
| `workspace_id`                       | text              | FK → `workspaces.id`, cascade                                             |
| `agent_id`                           | text?             | FK `(workspace_id, agent_id)` → `agents`, `ON DELETE SET NULL (agent_id)` |
| `version_number`                     | integer           | Unique with `agent_id`. 1, 2, 3 per agent                                 |
| `config`                             | jsonb             | `AgentVersionConfig`, below                                               |
| `knowledge_document_ids`             | text[]            | Agent context documents at lock time. No FK: files may go later           |
| `locked_by_user_id`, `locked_at`     | text?, timestamp  | Set on insert                                                             |
| `approved_by_user_id`, `approved_at` | text?, timestamp? | Set once on approval                                                      |
| `revoked_by_user_id`, `revoked_at`   | text?, timestamp? | Set once on revoke                                                        |
| `unlocked_by_user_id`, `unlocked_at` | text?, timestamp? | Set once on unlock                                                        |
| `created_at`                         | timestamp         |                                                                           |

All user columns are FKs → `users.id`, set null. `agents` gains `locked_version_id` (text?, FK
`(workspace_id, locked_version_id)` → `agent_versions`, set null). Null means unlocked.

```ts
interface AgentVersionConfig {
  aiModelId: string;
  systemPrompt: string;
  context: string | null;
  toolGrants: StoredAgentToolGrant[];
  defaultDatasetId: string | null;
  settings: AgentSettings;
}
```

- A version row is written only on lock or approve, never on a plain save.
- `config` and `knowledge_document_ids` never change. Each pair of history columns is written
  once and never cleared. A version is approved when `approved_at IS NOT NULL AND revoked_at IS
  NULL`.
- Re-approving after a revoke inserts a new version with the same `config`, approved at once.
- `agents.locked_version_id` is the source of truth for the current version. The version's
  `unlocked_at` is history. Both are written in the same transaction. The pointer stays on
  `agents` because the lock check is a condition on the agent row itself (see Lock check).
- `ON DELETE SET NULL (agent_id)` keeps `workspace_id` on the row (Postgres 15+, we run 18).
  Drizzle can't express the column list, so the FK ships in a custom migration.
- The `agent_version_id` FK from `task_run` belongs to #455.

### Relations

`agents` and `agent_versions` are linked by two FKs, one each way. Drizzle can't tell which FK a
relation means, so both get an `alias`, as for chat forks and video media in `relations.ts`:

- `agent.lockedVersion` (one, via `agents.locked_version_id`), alias `agentLockedVersion`, no
  reverse relation.
- `agent.versions` (many) ↔ `agentVersion.agent` (one, via `agent_versions.agent_id`), alias
  `agentVersions`.
- The four user columns get one-sided relations (`lockedBy`, `approvedBy`, `revokedBy`,
  `unlockedBy`) with no list on `users`, so they need no alias.

A test loads an agent with its locked version and its version list.

## Single sources of truth

| Knowledge                             | One place                                                                     | Used by                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Which fields are locked               | `agentVersionConfigFields` const next to the agent schema in `@repo/database` | `AgentVersionConfig` type (a `Pick` of it), snapshot, write guard |
| Who may lock, unlock, approve, revoke | `getAgentLockActions(...)` in the API's lock service                          | 403 checks, and `lockActions` in the response                     |
| Current version                       | `agents.locked_version_id`                                                    | API responses, write guard, #455 start check                      |
| Where agents sit in a workflow        | `getWorkflowAgentIds` in `@repo/workflow`                                     | workflow save, usage count                                        |
| What the agent can read and write     | tool grants + agent tool catalog (`@repo/ai/client`)                          | approval dialog, tool grants editor                               |
| Problem types (`agent-locked`, ...)   | `@repo/api-errors`                                                            | API, web error mapping                                            |

- The web never re-derives role rules. It renders the buttons from `lockActions`.
- The web can't import `@repo/database`. It doesn't need the field list: the form marks its
  configuration sections read-only as a block when `lock` is set, and keeps the identity section
  (name, description, mark) open.

## Permissions

Rank, lowest first: workspace editor, workspace manager, organization admin, organization owner.
`getAgentLockActions` compares the user's rank with the rank of the user who did the action
being undone.

| Action                       | Allowed for                                         |
| ---------------------------- | --------------------------------------------------- |
| Lock                         | editor and up                                       |
| Approve                      | manager and up                                      |
| Revoke                       | the approver, or same rank as the approver or above |
| Unlock, version not approved | the locker, or same rank as the locker or above     |
| Unlock, version approved     | revoke rights                                       |

The workspace guard resolves organization owners and admins to `manager`. The access query also
returns the organization role, so the rank needs no extra query. The rank of the earlier actor
is resolved in the same query that loads the agent's lock.

## Lock check

The agent update path in `@repo/database` refuses a change to a locked field while
`locked_version_id` is set (`AgentLockedError`, mapped to `409 agent-locked`). User-facing writers
go through it: the PATCH route and the knowledge file routes (upload, replace, delete, retry).
Renaming a knowledge file stays open: names are UI only.

| Locked                                                                                 | Open                                         |
| -------------------------------------------------------------------------------------- | -------------------------------------------- |
| model, system prompt, context, tool grants, default dataset, settings, knowledge files | name, description, icon, tone, image, memory |

- **Unchanged values pass.** The agent form sends every field on each save. The guard refuses
  only a value that differs: `WHERE locked_version_id IS NULL OR (system_prompt = $1 AND
  tool_grants = $2::jsonb AND ...)`. Tool grants are sorted by id before every save, because
  `jsonb` array equality depends on order.
- **No extra query.** The condition sits in the `UPDATE`. Postgres re-checks it on the row after
  waiting for a row lock, so a save running alongside a lock gets a clean `409`. Only when no
  row matched does a second query tell `404` from `409`.
- **Knowledge file writes** take `SELECT ... FOR SHARE` on the agent row and check
  `locked_version_id` there. That conflicts with the `FOR UPDATE` of lock, so an upload can't
  slip in after the lock read the file list.
- **System writes pass.** Cleanup that clears a reference (dataset delete nulls
  `defaultDatasetId`) doesn't go through the guard. Runs read `version.config`, so the live row
  may drift from the version while locked: the version is what runs, the live row is what chat
  uses.
- **Delete** refuses a locked agent with `409 agent-locked`, through the same condition.

## Query budget

| Operation                   | Queries                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Agent list and detail       | Unchanged count. `lock` comes from a left join on `agent_versions` and `users`, in the same query             |
| Save an agent               | Unchanged. The lock condition sits in the `UPDATE`                                                            |
| Knowledge file write        | One extra `FOR SHARE` read in the write's transaction                                                         |
| Lock                        | One transaction: agent `FOR UPDATE` with the knowledge file readiness aggregate, insert version, update agent |
| Approve unlocked or revoked | Same as lock. The version is inserted with its approval columns set                                           |
| Approve, revoke, unlock     | One `UPDATE ... RETURNING`, conditioned on the current state                                                  |
| Version list                | One query with joins for the user names                                                                       |
| Usage                       | One query, two scalar subqueries                                                                              |
| `getApprovedAgentVersion`   | One join                                                                                                      |

No per-agent or per-version lookups anywhere.

## API

All under `/workspace/:workspaceId/agent/:agentId`.

| Method and path               | Does                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| `POST /lock`                  | New version from the current config, sets `locked_version_id`          |
| `DELETE /lock`                | Sets `unlocked_*`, clears `locked_version_id`. #455 adds the run check |
| `POST /unattended-approval`   | Locks first if unlocked, new version if revoked, else approves current |
| `DELETE /unattended-approval` | Sets `revoked_*` on the current version                                |
| `GET /versions`               | Versions, newest first, with user names                                |
| `GET /usage`                  | `{ workflowCount, assignedTaskCount }` for the unlock dialog           |

Problem types, all `409`:

- `agent-locked`: locked fields changed, or delete while locked.
- `agent-already-locked`: lock on a locked agent.
- `agent-not-locked`: unlock on an unlocked agent.
- `agent-already-approved`: approve on an approved version.
- `agent-not-approved`: revoke on a version without a live approval.
- `knowledge-files-not-ready`: lock or approve while a knowledge file is `pending` or `failed`.

Lock and approve run in one transaction with `SELECT ... FOR UPDATE` on the agent row. The next
`version_number` is `max + 1` under that lock; the unique index catches the rest.

The agent detail and list responses gain `lock`; the detail also gains `lockActions`:

```ts
lock: {
  versionId: string;
  versionNumber: number;
  lockedBy: { id: string; name: string } | null;
  lockedAt: string;
  approval: { approvedBy: { id: string; name: string } | null; approvedAt: string } | null;
} | null;
lockActions: { canLock: boolean; canUnlock: boolean; canApprove: boolean; canRevoke: boolean };
```

`lockActions` is computed from data already loaded, so it costs no query.

**Usage.** Both counts are live, read when the dialog opens.

- `assignedTaskCount`: tasks with this `assigned_agent_id` and status `backlog`, `todo`,
  `in_progress` or `in_review`.
- `workflowCount`: workflows whose published definition references the agent. `workflows` gains
  `agent_ids` (text[], GIN index), written by the workflow save path from `getWorkflowAgentIds`
  on publish. The count is `WHERE agent_ids @> ARRAY[$agentId]`. A one-time backfill script in
  `apps/api` fills existing rows with the same function. No hand-written JSON path query: it
  would copy the rule.

## Consumer seam for #455

`getApprovedAgentVersion({ agentId, workspaceId })` in `@repo/database`: one query joining
`agents.locked_version_id` to `agent_versions` where the version is approved. Returns the
version or null. #455 calls it at run start and stores the id on the run.

**Pinned configuration, current policy.** A version pins what the agent is. What it may use is
checked at run start against today's state. It never runs silently with fewer tools. At run
start #455 checks that the model exists and is allowed for the organization, that every tool in
`config.toolGrants` is still in the catalog, and that its connections exist. Any miss fails the
run permanently with "re-approve the agent".

## Web

In `AgentUpsertForm.vue` and its header:

- Header actions: Lock, Approve for unattended runs, Unlock, Revoke approval. Each shows when
  `lockActions` allows it, and is disabled while its request is pending. No role logic in the
  web.
- One composable per mutation (`useLockAgent`, `useUnlockAgent`, ...), each invalidating the
  agent detail query. The banner and the header read the same `lock` object from that query.
- Banner above the form: "Locked by <user>" plus ", approved for unattended runs by <user>".
- Configuration sections render read-only as a block. Name, description and mark stay editable.
- Approval dialog: write and read lists from the tool grants and `@repo/ai`'s agent tool catalog
  (access level per grant), the knowledge-files line and the responsibility line.
- Unlock dialog: the counts from `GET /usage`.
- Versions: a sheet with the version list and its history (US-5).

## Extension points

- **Unattended run consumers.** Task runs (#455) first, workflows later. Each calls
  `getApprovedAgentVersion` at start, checks current policy and stores the version id.
- **Knowledge base as a tool.** When knowledge files become a tool grant, they move into
  `config.toolGrants` and `knowledge_document_ids` stops being written.
- **Faked in tests:** nothing. Lock, approve and the checks run against the test database.
- **Not abstracted:** a generic "versioned resource". Only agents need it; #171 covers history
  for every resource.
- **Packages:** none added.
