# Agent Defaults & Settings

Status: implemented, verified

Two related gaps in the agent Settings tab, fixed together:

- **Part A**: the "make this the default agent" switch has no uniqueness
  guard. A user can end up with several default agents, and the default
  lookup is nondeterministic in "all workspaces" mode.
- **Part B**: `AgentSettings` (`temperature`, `maxOutputTokens`) exist in the
  DB schema and are already **read** by both model call sites, but there is
  no way to **write** them. Every agent silently keeps the default
  `{ temperature: 0.7 }` forever.

## Part A: one default agent per workspace scope

### Rule

`isDefault` is unique per **scope**, where scope = the agent's own
`workspaceId` and `null` (unassigned) is its own scope:

- A workspace-scoped agent made default clears other defaults **in that
  workspace** only.
- An unassigned agent made default clears other **unassigned** defaults
  only. Workspace-scoped defaults are untouched.

The scope comes from the agent row being saved, never from the UI's active
workspace selection ("all" / "unassigned" / workspace). This makes the
behavior deterministic regardless of the current view.

### Current state

- `packages/database/src/repositories/agent.repo.ts`: `upsertAgent()` writes
  `isDefault` with no cleanup of siblings.
- `getOrCreateDefaultAgentForUser()` (same file) queries
  `where: { userId, workspaceId, isDefault: true }`. When `workspaceId` is
  `undefined` (chat created in "all" mode), Drizzle drops the filter and the
  query matches **any** default agent, including workspace-scoped ones.
- No DB constraint prevents multiple defaults in a scope.

### Changes

1. **Scoped cleanup on write** (`upsertAgent`): when `isDefault` is `true`,
   wrap the write in a transaction that first clears siblings in the same
   scope:

   ```sql
   UPDATE agents SET is_default = false
   WHERE user_id = $userId
     AND workspace_id IS NOT DISTINCT FROM $workspaceId
     AND id <> $agentId
   ```

   `IS NOT DISTINCT FROM` makes `null = null` true, so one statement covers
   both the workspace and unassigned scopes. Setting `isDefault` to `false`
   needs no cleanup: zero defaults in a scope is a valid state (see fallback).

2. **Deterministic lookup** (`getOrCreateDefaultAgentForUser`): change the
   filter to `workspaceId: workspaceId ?? { isNull: true }`, so "all" and
   "unassigned" modes resolve to the unassigned-scope default instead of a
   random one.

3. **Fallback stays: clone the template.** When a scope has no default agent
   yet, `getOrCreateDefaultAgentForUser` already clones the default agent
   template into that scope with `isDefault: true`. Keep this. One fix: the
   clone currently drops the template's `settings`; pass
   `settings: defaultAgent.settings` through so template settings survive
   the clone (relevant once Part B makes settings visible).

4. **DB-level guarantee**: two partial unique indexes on `agents` in
   `agent.schema.ts`, so no future write path can violate the invariant:

   - `(user_id, workspace_id) WHERE is_default AND workspace_id IS NOT NULL`
   - `(user_id) WHERE is_default AND workspace_id IS NULL`

   Two indexes because a single unique index treats NULLs as distinct. Under
   a write race the transaction in (1) plus these indexes make the second
   writer fail instead of creating a duplicate default. Schema change ships
   via `db:push` (pre-production, no migration files).

### Non-goals

- No change to how workflow inline nodes resolve `getDefaultAgent()` (that
  is the **template** repo, a different concept, and untouched).
- No UI change beyond what Part B does to the Settings tab. The switch
  itself keeps its current label and behavior.

## Part B: wire up temperature and maxOutputTokens

### Current state

- Read side works already: `apps/api/src/controllers/chat.controller.ts`
  (~line 298) and `apps/worker/src/workflow/executors/agent.executor.ts`
  (~line 119) pass `agent.settings?.temperature` / `maxOutputTokens` into
  the model call. **No changes needed there.**
- Write side is missing entirely: `settings` is absent from
  `validUpsertAgentBody`, the agent controller passthrough, the
  `upsertAgent` insert/update columns, the web `Agent` type, and the form.

### Semantics

Both settings are nullish end to end (they may be removed in a later
iteration, so nothing should hard-depend on them):

- `temperature`: number, 0 to 1, normalized scale (Anthropic-style; avoids
  a provider 400 that a 0-to-2 scale would allow). Unset = provider default.
- `maxOutputTokens`: integer, 1 to 64,000. Unset = provider default.

Null and undefined both mean "unset". The API normalizes nulls to absent
keys before persisting, so the stored `AgentSettings` JSONB keeps its
current `{ temperature?: number; maxOutputTokens?: number }` shape and the
read sites need no change.

### Changes

1. **Validation** (`apps/api/src/middlewares/validationMiddlewares.ts`), add
   to `validUpsertAgentBody`:

   ```ts
   settings: z
     .object({
       temperature: z.number().min(0).max(1).nullish(),
       maxOutputTokens: z.number().int().min(1).max(64_000).nullish(),
     })
     .optional(),
   ```

2. **Controller** (`agent.controller.ts` POST `/agent`): pass `settings`
   through to `upsertAgent`, converting `null` values to `undefined` (small
   normalize helper, same spirit as `normalizeAgentContext`).

3. **Repo** (`agent.repo.ts` `upsertAgent`): destructure `settings` and add
   it to both the insert `values` and the `onConflictDoUpdate` `set`. When
   the client sends no settings object, keep the column's existing
   `$defaultFn` behavior on insert and leave the stored value untouched on
   update (i.e. omit from `set` when `undefined`).

4. **Web types** (`apps/web/app/features/agent/types/index.ts`):

   ```ts
   export interface AgentSettings {
     temperature?: number | null;
     maxOutputTokens?: number | null;
   }
   ```

   plus `settings?: AgentSettings | null` on `Agent`.

5. **Form** (`AgentUpsertForm.vue`, existing Settings tab, below the
   default-agent switch):

   - `temperature`: shadcn **Slider**, range 0 to 1, step 0.05, with the
     current value displayed next to the label. Not yet installed; add via
     `npx shadcn-vue@latest add slider` from `apps/web/`.
   - `maxOutputTokens`: plain number `Input`, empty allowed.
   - Both map empty/cleared to `null` in the payload. Form defaults come
     from `props.settings` (undefined-safe).
   - Helper line under the pair: "Leave empty to use the model's defaults."

### Touched files

| File                                                         | Part | Change                                                                                                      |
| ------------------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------- |
| `packages/database/src/schema/agent.schema.ts`               | A    | two partial unique indexes                                                                                  |
| `packages/database/src/repositories/agent.repo.ts`           | A+B  | scoped default cleanup in transaction; fixed default lookup; clone settings in fallback; persist `settings` |
| `apps/api/src/middlewares/validationMiddlewares.ts`          | B    | `settings` in `validUpsertAgentBody`                                                                        |
| `apps/api/src/controllers/agent.controller.ts`               | B    | pass `settings` through, normalize nulls                                                                    |
| `apps/web/app/features/agent/types/index.ts`                 | B    | `AgentSettings` + `Agent.settings`                                                                          |
| `apps/web/app/features/agent/components/AgentUpsertForm.vue` | B    | slider + number input in Settings tab                                                                       |
| `apps/web/app/components/ui/slider/`                         | B    | new shadcn component (generated)                                                                            |

### Resolved questions

1. **Temperature scale**: 0 to 1, normalized. Accepted.
2. **maxOutputTokens bounds**: integer 1 to 64,000, empty = provider
   default. Accepted.
3. **UI controls**: slider for temperature, plain number input for max
   tokens, both clearable/nullish since the settings may be removed later.
4. **Temperature 0 = disabled** (added post-implementation): Anthropic is
   deprecating the temperature option, so the default is now "disabled" (no
   value stored or sent). Slider position 0 means disabled, shows
   "Disabled", and the API normalizes 0 to undefined. Consequence: users
   cannot set a literal temperature of 0. Accepted: deterministic output is
   only useful for retrieval, which will be solved later via a dedicated
   retrieval tool whose internal agent can pin its own temperature.
