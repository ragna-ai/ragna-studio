# Agents: agent tool grants (slices)

> Build plan for [design.md](./design.md). Every slice follows AGENTS.md and loads the clean-code
> skill, plus tdd for `apps/api` and the packages it reaches. Each slice runs its own tests and
> `pnpm check-types` before it reports done.

## Order

| Wave | Slices (parallel within a wave) | Needs            |
| ---- | ------------------------------- | ---------------- |
| 0    | S0 Contract and expand          | nothing          |
| 1    | S1 Server, S2 API, S3 Web       | S0 on the branch |
| 2    | S4 Backfill and contract        | S1, S2, S3       |
| 3    | Integration pass (lead)         | all              |

S0 only adds. The old `tools` and `integration_tools` columns stay until S4, so every wave 1
slice type-checks on its own.

## Contracts shared by all slices

Frozen by S0. A slice that needs a change asks the lead. It doesn't edit another slice's files.

```ts
// @repo/ai/client
toolAccessSchema; type ToolAccess = 'read' | 'write';
BUILTIN_AGENT_TOOL_IDS; type BuiltinAgentToolId; type IntegrationAgentToolId; // 'google-drive'
type AgentToolId = BuiltinAgentToolId | IntegrationAgentToolId;
AGENT_TOOL_CATALOG: readonly AgentToolCatalogEntry[]; // { id, category, hasAccessLevels }
agentToolGrantSchema; type AgentToolGrant; agentToolGrantsSchema; // unique ids

// @repo/database
interface StoredAgentToolGrant { id: string; access?: string }
// agents.tool_grants, agent_templates.tool_grants; Drizzle field and API field `toolGrants`

// @repo/ai (server)
buildAgentToolset(grants: readonly StoredAgentToolGrant[], writer, ctx): ToolSet;
buildAgentInstructions({ toolIds: readonly string[], ... });
```

## S0 Contract and expand (lead or one agent, before wave 1)

- `packages/ai/src/tools/agent-tool-catalog.ts` as in the design. Export from `@repo/ai/client`.
  Move `ToolAccess` there and import it in `tool-definition.ts`.
- Unit test for `agentToolGrantsSchema`: duplicates, missing or extra `access`, unknown id.
- `StoredAgentToolGrant` and the `toolGrants` column on `agents` and `agent_templates`.
- Expand migration via `pnpm --filter @repo/database db:generate`.
- Rebuild `@repo/ai`, `@repo/database`. Run `pnpm check-types` and `pnpm check:web-type-graph`.
- Glossary entry "agent tool grant" is already in `specs/glossary.md`.

## S1 Server runtime (AC-3, AC-8 server half)

Owns `packages/ai/src/tools/agent.tools.ts`, `cloud-drive.tools.ts`,
`packages/ai/src/services/agent.service.ts`, `apps/api/src/services/chat.service.ts` (tool and
instruction calls only), `apps/worker/src/workflow/executors/*`,
`apps/worker/src/mail/email-draft.service.ts`, and the tests `apps/api/test/chat/`,
`apps/api/test/cloud-drive/`, `apps/worker/test/`.

- `toolsets` and `accessToolsets` records, grant parsing, `toAgentTools` helper.
- Remove `AgentToolContext.integrationTools` and `getAgentCloudDriveTools`.
- Callers read `agent.toolGrants`. Drop the `tools: AgentTools` cast in `run-referenced-agent.ts`
  in favour of `toolGrants: StoredAgentToolGrant[]`.
- Tests: a `read` grant offers no write tool, in chat and in a workflow run (AC-3). An invalid
  stored grant is skipped and the rest still build.

## S2 API and repository (AC-1 API half, AC-4 to AC-6)

Owns `apps/api/src/validation/agent.schema.ts`, `controllers/agent.controller.ts`,
`services/agent.service.ts`, `packages/database/src/repositories/agent.repo.ts`,
`agent-template.repo.ts`, `packages/database/src/seed/index.ts`, `packages/database/src/zod/index.ts`
(agent part), and the tests in `apps/api/test/agent/`.

- Bodies: `toolGrants: agentToolGrantsSchema`, `z.strictObject` for create and update.
- Repository create, update and list read and write `toolGrants`. The list includes it (AC-1).
- Create-from-template copies `tool_grants`.
- Tests first: duplicates, wrong `access`, old keys `tools` and `integrationTools` all `422`
  with no change; list returns `toolGrants`; template copy keeps grants.

## S3 Web (AC-1, AC-7, AC-8 web half)

Owns `apps/web/app/features/agent/**`, `apps/web/app/features/chat/components/ChatConversation.vue`,
`ChatAgentTools.vue`, the comment in `features/chat/lib/tool-icons.ts`, and
`apps/web/i18n/locales/*.json` (agent tool keys only).

- `AGENT_TOOL_VISUALS satisfies Record<AgentToolId, AgentToolVisual>` with `google-drive`.
- i18n keys `agent.tool.<id>.*` for every id, `agent.tool.accessLevel*` shared.
- `AgentToolList.vue`: one `AgentToolGrant[]` model, rows from `AGENT_TOOL_CATALOG`, level select
  where `hasAccessLevels`, unrendered grants kept (AC-7).
- `AgentUpsertForm.vue`: one `toolGrants` field.
- Run `pnpm check-types` and `pnpm check:web-type-graph`.

## S4 Backfill and contract (AC-2)

Owns the backfill and contract migrations, `packages/database/src/schema/agent.schema.ts`
(removals), `packages/integrations/src/catalog/catalog.types.ts`, `packages/integrations/src/type-checks.ts`,
and `apps/api/test/database/agent-tool-grants-backfill.test.ts`.

- Backfill SQL as in the design, as a custom migration between expand and contract.
- Test first, same pattern as `private-workspace-backfill.test.ts`: built-ins only, drive only,
  both, a duplicate built-in, an unknown id, an empty row, a template row.
- Contract: drop the old columns. Remove `agentToolValues`, `AgentTool`, `AgentTools`,
  `IntegrationTools`, `integrationToolAccessLevelValues`, the database `CloudDriveIntegrationId`,
  `integrationToolsSchema` and `integrationToolAccessLevelSchema`. Fix `type-checks.ts`.
- Any reader that still uses an old name fails `pnpm check-types`. Report it to the lead. Don't
  fix it inside another slice's files.

## Integration pass (lead)

- Full `pnpm check-types`, `pnpm check:web-type-graph`, `pnpm lint`, `pnpm test:api`,
  `pnpm test:worker`.
- Grep for `integrationTools`, `integration_tools`, `agentToolValues` and `AgentTools`: no hits
  outside migrations.
- Read every slice's self-flagged notes and verify each on disk.
- Docs: check the `apps/docs` agent page for tool settings. If it needs no change, say so in the
  PR body.
