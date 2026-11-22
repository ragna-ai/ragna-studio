# Agent lock: design

Issue #462. Stories in [prd.md](./prd.md).

## Data model

New table `agent_versions`, registered in `relations.ts`.

| Column                                                     | Type              | Notes                                                                     |
| ---------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `id`                                                       | text              | uuidv7                                                                    |
| `workspace_id`                                             | text              | FK → `workspaces.id`, cascade                                             |
| `agent_id`                                                 | text?             | FK `(workspace_id, agent_id)` → `agents`, `ON DELETE SET NULL (agent_id)` |
| `version_number`                                           | integer           | Unique with `agent_id`. 1, 2, 3 per agent                                 |
| `config`                                                   | jsonb             | `AgentVersionConfig`, below                                               |
| `knowledge_document_ids`                                   | text[]            | Agent context documents at lock time. No FK: files may go later           |
| `locked_by_user_id`, `locked_at`                           | text?, timestamp  | FK → `users.id`, set null                                                 |
| `unattended_approved_by_user_id`, `unattended_approved_at` | text?, timestamp? | Null until approved, cleared on revoke                                    |
| `created_at`                                               | timestamp         |                                                                           |

`agents` gains `locked_version_id` (text?, FK `(workspace_id, locked_version_id)` →
`agent_versions`, set null). Null means unlocked. The two FKs form a cycle; the version row is
inserted first, then the agent is updated.

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
- Rows are immutable except the two approval columns.
- `ON DELETE SET NULL (agent_id)` keeps `workspace_id` on the row (Postgres 15+, we run 18).
  Drizzle can't express the column list, so the generated migration is edited by hand, or the
  FK ships in a custom migration.
- The `agent_version_id` FK from `task_run` belongs to #455.

## Single sources of truth

| Knowledge                             | One place                                                                        | Used by                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Which fields are locked               | `agentVersionConfigFields` const next to the agent schema in `@repo/database`    | `AgentVersionConfig` type (a `Pick` of it), snapshot, write guard |
| Who may lock, unlock, approve, revoke | `getAgentLockActions({ workspaceRole, userId, lock })` in the API's lock service | 403 checks, and `lock.actions` in the response                    |
| Locked state and approval             | `agents.locked_version_id` → `agent_versions`                                    | API responses, #455 start check                                   |
| What the agent can read and write     | tool grants + agent tool catalog (`@repo/ai/client`)                             | approval dialog, tool grants editor                               |
| Problem types (`agent-locked`, ...)   | `@repo/api-errors`                                                               | API, web error mapping                                            |

- The web never re-derives role rules. It renders the buttons from `lock.actions`.
- The web can't import `@repo/database`. It doesn't need the field list: the form marks its
  configuration sections read-only as a block when `lock` is set, and keeps the identity section
  (name, description, mark) open.

## Lock check

The shared agent write path in `@repo/database` refuses locked fields while
`locked_version_id` is set (`AgentLockedError`, mapped to `409 agent-locked`). Every writer goes
through it: the PATCH route, the knowledge file routes (upload, replace, delete, retry) and any
later MCP or tool path. Rename of a knowledge file stays open: names are UI only.

| Locked                                                                                 | Open                                         |
| -------------------------------------------------------------------------------------- | -------------------------------------------- |
| model, system prompt, context, tool grants, default dataset, settings, knowledge files | name, description, icon, tone, image, memory |

The check costs no extra query. It is a condition on the write itself: `UPDATE agents ... WHERE
id = ? AND workspace_id = ? AND locked_version_id IS NULL` when the update touches a locked field,
and the same `NOT EXISTS` condition on knowledge file writes. Only when no row matched does a
second query tell `404` from `409`. That is the failure path, not the hot path.

Delete refuses a locked agent with `409 agent-locked`, through the same condition.

## Query budget

| Operation                 | Queries                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Agent list and detail     | Unchanged count. `lock` comes from a left join on `agent_versions` and two `users`, in the same query         |
| Save an unlocked agent    | Unchanged. The lock condition sits in the `UPDATE`                                                            |
| Lock                      | One transaction: agent `FOR UPDATE` with the knowledge file readiness aggregate, insert version, update agent |
| Approve an unlocked agent | Same as lock. The version is inserted with its approval columns set                                           |
| Approve, revoke, unlock   | One `UPDATE ... RETURNING`, conditioned on the current state                                                  |
| Version list              | One query with joins for locker and approver names                                                            |
| Usage                     | One query, two scalar subqueries                                                                              |
| `getApprovedAgentVersion` | One join                                                                                                      |

No per-agent or per-version lookups anywhere (AGENTS.md, N+1 rule).

## API

All under `/workspace/:workspaceId/agent/:agentId`. Roles come from `workspaceGuard`
(`workspaceRole`); organization owners and admins already resolve to `manager`.

| Method and path               | Who                          | Does                                                          |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `POST /lock`                  | editor and up                | New version from the current config, sets `locked_version_id` |
| `DELETE /lock`                | the locker, manager and up   | Clears `locked_version_id`. #455 adds the active-run check    |
| `POST /unattended-approval`   | manager and up               | Locks first if unlocked, then approves the current version    |
| `DELETE /unattended-approval` | the approver, manager and up | Clears the approval columns of the current version            |
| `GET /versions`               | any workspace user           | Versions, newest first, with locker and approver names        |
| `GET /usage`                  | any workspace user           | `{ workflowCount, assignedTaskCount }` for the unlock dialog  |

- `409 agent-locked`: lock on a locked agent, locked fields changed, delete while locked.
- `409 agent-not-locked`: unlock or revoke on an unlocked agent.
- `409 knowledge-files-not-ready`: lock or approve while a knowledge file is `pending` or `failed`.
- `409 agent-not-approved`: revoke on a version without approval.

Lock and approve run in one transaction with `SELECT ... FOR UPDATE` on the agent row. The next
`version_number` is `max + 1` under that lock; the unique index catches the rest.

The agent detail and list responses gain `lock`:

```ts
lock: {
  versionId: string;
  versionNumber: number;
  lockedBy: { id: string; name: string } | null;
  lockedAt: string;
  unattendedApproval: { approvedBy: { id: string; name: string } | null; approvedAt: string } | null;
} | null;
lockActions: { canLock: boolean; canUnlock: boolean; canApprove: boolean; canRevoke: boolean };
```

`lockActions` is only on the detail response. It is computed from data already loaded (role from
the guard, ids from the join), so it costs no query.

`workflowCount` counts workflows whose draft or published definition has an agent or team node
with this agent id, in one jsonb query. `assignedTaskCount` counts open tasks with
`assigned_agent_id`.

## Consumer seam for #455

`getApprovedAgentVersion({ agentId, workspaceId })` in `@repo/database`: one query joining
`agents.locked_version_id` to `agent_versions` where `unattended_approved_at is not null`. Returns
the version or null. #455 calls it at run start and stores the id on the run. Its runner builds
the agent from `config` and `knowledge_document_ids`, not from the live agent row.

## Web

In `AgentUpsertForm.vue` and its header:

- Header actions: Lock, Approve for unattended runs, Unlock, Revoke approval. Each shows when
  `lockActions` allows it. No role logic in the web.
- One composable per mutation (`useLockAgent`, `useUnlockAgent`, ...), each invalidating the
  agent detail query. The banner and the header read the same `lock` object from that query.
- Banner above the form: "Locked by <user>" plus ", approved for unattended runs by <user>".
- Configuration sections render read-only as a block. Name, description and mark stay editable.
- Approval dialog: write and read lists from the tool grants and `@repo/ai`'s agent tool catalog
  (access level per grant), the knowledge-files line and the responsibility line.
- Unlock dialog: the counts from `GET /usage`.
- Versions: a sheet with the version list (US-5).

## Extension points

- **Unattended run consumers.** Task runs (#455) first, workflows later. Each calls
  `getApprovedAgentVersion` at start and stores the version id. Nothing else to add.
- **Knowledge base as a tool.** When knowledge files become a tool grant, they move into
  `config.toolGrants` and `knowledge_document_ids` stops being written.
- **Faked in tests:** nothing. Lock, approve and the checks run against the test database.
- **Not abstracted:** a generic "versioned resource". Only agents need it; #171 covers history
  for every resource.
- **Packages:** none added.
