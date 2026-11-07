# Agents: agent tool grants (design)

> **Status: proposed** (2026-11-07). Issue #301. Build plan: [slices.md](./slices.md).

A refactor with no PRD: the only user-visible change is AC-1. The problem statement lives in
#301. This doc holds the decisions, the contract and every file that changes.

## Acceptance criteria

- **AC-1** Given an agent with Google Drive switched on, when a user opens a new chat with that
  agent, then the chat input shows the Google Drive icon and label next to the built-in tool
  icons.
- **AC-2** Given an existing agent with built-in tools and Google Drive at `read`, when the
  migration runs, then the agent has the same built-in tools and Google Drive at `read`, and its
  chat offers the same AI SDK tools as before.
- **AC-3** Given an agent with Google Drive at `read`, when a chat or workflow builds its tools,
  then no cloud drive tool with write access is offered to the model.
- **AC-4** Given a create or update body with two grants for the same tool, then the API answers
  `422`.
- **AC-5** Given a create or update body with an integration grant without `access`, or a
  built-in grant with `access`, then the API answers `422`.
- **AC-6** Given a body in the old shape (`tools` as a list of ids, or `integrationTools`), then
  the API answers `422` and changes nothing.
- **AC-7** Given an agent with a Google Drive grant and an editor who has no Google Drive
  connection, when the editor saves the agent, then the Google Drive grant is unchanged.
- **AC-8** Rule: a tool id without a web icon entry, or without a server toolset entry, fails
  `pnpm check-types`.

## Decisions

**D1. The column is typed by shape only.** `@repo/ai` depends on `@repo/integrations`, which
depends on `@repo/database`. So the database can't import `AgentToolId`. The column type is
`StoredAgentToolGrant` (`{ id: string; access?: string }`). The strict type lives in
`@repo/ai/client`. Writes are parsed by the API body schema. Reads are parsed in
`buildAgentToolset` and narrowed in the web. Lost: a strict type on the Drizzle row. Rejected: a
new leaf package below `@repo/database` for tool and integration ids.

**D2. One toolset entry per agent tool id.** Each id has exactly one server factory. Integration
ids each get their own line that calls the shared cloud drive factory. Lost: one line per new
drive. Rejected: a registry keyed by integration category, which saves that line but adds type
machinery and a second place to look.

**D3. Access applies per AI SDK tool.** `ToolDefinition` already has `access: ToolAccess`. A
factory for a tool with access levels receives the grant's level and keeps only the definitions
it allows, with one shared helper. No factory is split by level.

**D4. Old bodies are rejected, not converted.** The API and web ship together. An open tab with
the old bundle gets a `422` and a reload fixes it. Rejected: accepting both shapes for a release,
which leaves conversion code to remove later.

## Contract

New file `packages/ai/src/tools/agent-tool-catalog.ts`, exported from `@repo/ai/client`. It
imports only `zod` and `@repo/integrations/catalog`, never `@repo/database`.

```ts
export const toolAccessSchema = z.enum(['read', 'write']);
export type ToolAccess = z.infer<typeof toolAccessSchema>; // moves here from tool-definition.ts

export const BUILTIN_AGENT_TOOL_IDS = [
  'think', 'webSearch', 'webBrowser', 'imageGen', 'videoGen',
  'linkedinDraft', 'memory', 'datasets', 'documents', 'tasks',
] as const;
export type BuiltinAgentToolId = (typeof BUILTIN_AGENT_TOOL_IDS)[number];

/** Integration categories whose integrations are agent tools. #229 adds 'mail'. */
const AGENT_TOOL_INTEGRATION_CATEGORIES = ['cloud-drive'] as const;
export type IntegrationAgentToolId = IntegrationIdIn<(typeof AGENT_TOOL_INTEGRATION_CATEGORIES)[number]>;

export type AgentToolId = BuiltinAgentToolId | IntegrationAgentToolId;

export interface AgentToolCatalogEntry {
  id: AgentToolId;
  category: 'builtin' | IntegrationCategory;
  hasAccessLevels: boolean;
}
export const AGENT_TOOL_CATALOG: readonly AgentToolCatalogEntry[];

export const agentToolGrantSchema = z.union([
  z.strictObject({ id: z.enum(BUILTIN_AGENT_TOOL_IDS) }),
  z.strictObject({ id: z.enum(INTEGRATION_AGENT_TOOL_IDS), access: toolAccessSchema }),
]);
export type AgentToolGrant = z.infer<typeof agentToolGrantSchema>;

/** Rejects a second grant for the same id. */
export const agentToolGrantsSchema = z.array(agentToolGrantSchema).refine(hasUniqueIds);
```

- `INTEGRATION_AGENT_TOOL_IDS` is read from `INTEGRATION_CATALOG` by category. It must keep its
  literal type without an `as` cast. If `z.enum` can't take it, the S0 builder reports back.
- Today "has access levels" equals "is an integration". When a built-in gets levels (for example
  `documents`), it moves to a second id list and its grant branch gets `access`.
- `ToolAccess` replaces `IntegrationToolAccessLevel` in `@repo/integrations/catalog` and
  `integrationToolAccessLevelValues` in `@repo/database`. Both are removed.

**Database** (`packages/database/src/schema/agent.schema.ts`):

```ts
/** Shape only. Ids and access are validated in @repo/ai (agentToolGrantsSchema). */
export interface StoredAgentToolGrant { id: string; access?: string }
toolGrants: jsonb('tool_grants').notNull().$type<StoredAgentToolGrant[]>().default([]),
```

Both `agents` and `agent_templates` get `tool_grants`. Templates only ever hold built-in grants
(they are seeded, there is no write API). `defaultDatasetId` stays a column: it is a foreign key.

**API:** the agent create and update bodies replace `tools` and `integrationTools` with
`toolGrants: agentToolGrantsSchema`. Both bodies become `z.strictObject`, so old keys answer
`422` (AC-6). Responses return `toolGrants`, including the agent list.

## Server

`packages/ai/src/tools/agent.tools.ts`:

```ts
type ToolsetFactory = (writer: UIMessageStreamWriter, ctx: AgentToolContext) => ToolSet;
type AccessToolsetFactory = (writer, ctx, access: ToolAccess) => ToolSet;

const toolsets = { think: ..., datasets: ..., ... } satisfies Record<BuiltinAgentToolId, ToolsetFactory>;
const accessToolsets = {
  'google-drive': (writer, ctx, access) => getCloudDriveTools({ integrationId: 'google-drive', access, ... }),
} satisfies Record<IntegrationAgentToolId, AccessToolsetFactory>;

export function buildAgentToolset(
  grants: readonly StoredAgentToolGrant[], writer, ctx,
): ToolSet;
```

- Each stored grant is parsed with `agentToolGrantSchema`. An invalid one is skipped and logged
  once at `warn`. Then `'access' in grant` picks the record, with no cast.
- `AgentToolContext.integrationTools` and `getAgentCloudDriveTools` are removed.
- A shared helper `toAgentTools(definitions, access, toolContext)` keeps definitions whose
  `access` the grant allows (`write` allows both) and wraps them with `tool()`. It replaces the
  inline filter in `getCloudDriveTools`. The param `level` becomes `access`.
- `buildCloudDriveToolApproval` is unchanged. #281 replaces it.
- `buildAgentInstructions` (`packages/ai/src/services/agent.service.ts`) takes
  `toolIds: readonly string[]` instead of `tools`. Callers pass `grants.map((grant) => grant.id)`.

## Migration

Three folders in `packages/database/drizzle/`, same pattern as `enabled_integrations`
(20261104164014 and 20261104164015):

1. **Expand:** add `tool_grants jsonb NOT NULL DEFAULT '[]'` to `agents` and `agent_templates`.
2. **Backfill** (custom SQL): for each row, `tool_grants` = one `{ "id": t }` per distinct entry
   of `tools` that is a current built-in id, plus one `{ "id": k, "access": v }` per key of
   `integration_tools` where `k` is a current integration tool id and `v` is `read` or `write`.
   Unknown ids are dropped, because the old reader skipped them too. Order: built-ins first.
3. **Contract:** drop `agents.tools`, `agents.integration_tools` and `agent_templates.tools`.

The seed writes `toolGrants`. Hand SQL is not needed in production: `migrate` applies all three.

## Web

- `apps/web/app/features/agent/lib/agent-tool-icons.ts`: `AGENT_TOOL_VISUALS` becomes
  `satisfies Record<AgentToolId, AgentToolVisual>` with `google-drive: CloudIcon` (AC-8).
  `getAgentToolVisual` keeps its `string` input for stored ids and returns `undefined` for
  unknown ones.
- i18n: one key per tool id, `agent.tool.<id>.label` and `.description`. Move
  `agent.tool.cloudDrive.google-drive.*` to `agent.tool.google-drive.*` and
  `agent.tool.cloudDrive.accessLevel*` to `agent.tool.accessLevel*`, in both locales.
- `AgentToolList.vue`: one `v-model` of `AgentToolGrant[]`. The list renders built-ins and the
  integration tools the editor is connected to. Toggling or changing a level only touches that
  id's entry. Grants it doesn't render pass through unchanged (AC-7).
- `AgentUpsertForm.vue`: one field `toolGrants` validated by `agentToolGrantsSchema`.
- `ChatConversation.vue` and `ChatAgentTools.vue`: read ids from `agent.toolGrants` (AC-1).
- `apps/web/app/features/agent/types/index.ts`: `toolGrants?: AgentToolGrant[]` replaces
  `tools` and `integrationTools`.
- `apps/web/app/features/chat/lib/tool-icons.ts` is keyed by AI SDK tool name, not agent tool id.
  Only its comment pointing at `agentToolValues` changes.

## Files that change

| Package              | Files                                                                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@repo/ai`           | `tools/agent-tool-catalog.ts` (new), `tools/agent.tools.ts`, `tools/cloud-drive.tools.ts`, `tools/tool-definition.ts`, `services/agent.service.ts`, `client.ts`                                                                                                                          |
| `@repo/database`     | `schema/agent.schema.ts`, `zod/index.ts`, `repositories/agent.repo.ts`, `repositories/agent-template.repo.ts`, `seed/index.ts`, three migrations                                                                                                                                         |
| `@repo/integrations` | `catalog/catalog.types.ts` (drop `integrationToolsSchema`, `IntegrationTools`, `integrationToolAccessLevelSchema`), `type-checks.ts`                                                                                                                                                     |
| `apps/api`           | `validation/agent.schema.ts`, `controllers/agent.controller.ts`, `services/agent.service.ts`, `services/chat.service.ts`                                                                                                                                                                 |
| `apps/worker`        | `workflow/executors/team.executor.ts`, `workflow/executors/run-referenced-agent.ts`, `mail/email-draft.service.ts`                                                                                                                                                                       |
| `apps/web`           | see Web                                                                                                                                                                                                                                                                                  |
| tests                | `apps/api/test/agent/agents.test.ts`, `agent-template.test.ts`, `agent-workspace-references.test.ts`, `chat/chat-tool-approval.test.ts`, `cloud-drive/tools.test.ts`; `apps/worker/test/support/workflow-fixtures.ts`, `support/email-fixtures.ts`, `workflow/cloud-drive-write.test.ts` |

`packages/database/src/zod/index.ts` loses `agentToolsSchema` and `agentIntegrationToolsSchema`.
`agentSelectSchema`, `agentCreateSchema` and `agentUpdateSchema` have no readers; the slice
removes them if that stays true.

## Testing

| Criterion    | Level       | Folder                                                        |
| ------------ | ----------- | ------------------------------------------------------------- |
| AC-1         | API         | `apps/api/test/agent/` (list returns `toolGrants`)            |
| AC-2         | API         | `apps/api/test/database/` (runs the backfill SQL on fixtures) |
| AC-3         | API, worker | `apps/api/test/cloud-drive/`, `apps/worker/test/workflow/`    |
| AC-4 to AC-6 | API         | `apps/api/test/agent/`                                        |
| AC-7         | web         | none: covered by review of `AgentToolList.vue`                |
| AC-8         | types       | `pnpm check-types`                                            |

## Extension points

- **Axis:** agent tool id. **Contract:** `AgentToolGrant` plus one entry per id in each adapter
  (server toolsets, web visuals, i18n).
- **Known variants:** built-ins today, Google Drive (#265), OneDrive (#265, P3), integration
  actions such as mail and LinkedIn (#229), an explicit workspace connection on a grant (#229),
  approval policy by access type (#281).
- **Adding OneDrive:** its catalog and cloud drive provider entries (see the cloud drive design),
  one `accessToolsets` line, one `AGENT_TOOL_VISUALS` line, i18n keys. Grant schema and catalog
  pick it up from `INTEGRATION_CATALOG`.
- **Adding #229 mail actions:** `'mail'` in `AGENT_TOOL_INTEGRATION_CATEGORIES`, then one
  toolset, visual and i18n entry per mail integration. A `connectionId` on the integration grant
  branch is an optional field, not a reshape.
- **Giving a built-in access levels:** its tools become `ToolDefinition`s, its id moves to the
  access list, its factory moves to `accessToolsets`, and a backfill sets its level.
- **Fakes:** none new. Server tests use the existing vendor HTTP fakes in `@repo/testing`.
- **Packages considered:** none. Zod and the existing catalog cover it.
- **Not abstracted:** a separate `agent_tool` table (nothing queries agents by tool) and the
  approval policy (#281).
