# MCP server: implementation slices

> **Status: in-progress** (started 2026-09-24 on `feat/mcp-server`). Build plan for [prd.md](./prd.md).

Two waves. Wave 1 lands the database, auth and tool-definition foundations
in parallel. Wave 2 builds the API and the web UI against real types.

## Rules for every slice

- Load the `clean-code` skill first. No `as any`. Named exported interfaces
  for return types.
- Comments: default to zero. Only a non-obvious "why", one line max. No doc
  paragraphs, doc cross-references or investigation narrative.
- Stay inside your owned paths. If you need something outside them, stop
  and report it. Don't edit it.
- After editing a `@repo/*` package, rebuild it with
  `pnpm --filter @repo/<pkg> build`.
- Only slice 3 runs `bun test` (apps/api). No other slice runs tests.
- No type-check runs required, no commits, no `db:push`. Sven does those.
- When a library API is uncertain, read it in `node_modules` (the installed
  version), not from memory.
- End your report with a **Flags** section: every assumption, every doubt,
  every place you deviated from the PRD or this doc.

## Contracts

Pinned here so slices can build in parallel. Changing one means reporting
it, not silently adapting.

### C1: database (slice 1 provides)

```ts
export type DatasetOrigin = 'user' | 'agent' | 'mcp';
export type DatasetRowWriter = 'user' | 'agent' | 'mcp';
// DatasetRow gains `writtenBy: DatasetRowWriter` (column written_by, default 'user').
// createDatasetRow / updateDatasetRow / moveDatasetRow gain `writtenBy?: DatasetRowWriter` (default 'user').

export type McpAccessLevel = 'off' | 'read' | 'write';
export type McpIntegrationId = 'datasets';
export type McpAccess = Partial<Record<McpIntegrationId, McpAccessLevel>>;
```

Repos exported from `@repo/database`:

- `getMcpSettings({ userId })` → settings or a default (`enabled: false`, `access: {}`)
- `upsertMcpSettings({ userId, enabled, access })`
- `upsertMcpConnection({ userId, clientId, workspaceId })` (unique on user + client, replaces workspace)
- `findMcpConnection({ userId, clientId })`
- `listMcpConnections({ userId })` (with workspace name and OAuth client name)
- `deleteMcpConnection({ connectionId, userId })`
- `deleteAllMcpConnections({ userId })`
- `revokeMcpClientGrants({ userId, clientId })` (plugin refresh tokens + consent rows)
- `touchMcpConnection({ connectionId })` (`last_used_at = now`)
- `recordMcpToolCall({ connectionId, toolName, isError })`

### C2: tool definitions (slice 2 provides, from `@repo/ai`)

```ts
export type ToolAccess = 'read' | 'write';
export type ToolOrigin = 'agent' | 'mcp';

export interface ToolContext {
  userId: string;
  workspaceId: string;
  origin: ToolOrigin;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface ToolDefinition<Schema extends z.ZodObject, Output> {
  name: string;
  description: string;
  inputSchema: Schema;
  access: ToolAccess;
  annotations?: ToolAnnotations;
  execute(input: z.infer<Schema>, ctx: ToolContext): Promise<Output>;
}
```

`datasetToolDefinitions: ToolDefinition<z.ZodObject, unknown>[]` holds the
definitions directly. No wrapper helpers: one definition per tool, one adapter
per transport (method syntax on `execute` lets the typed definitions share one
list type). Outputs keep the existing `{ error: string }` failure shape.

### C3: auth (slice 1 provides)

- `@repo/config`: `mcpEnabled: boolean` (`MCP_ENABLED`, default false),
  `mcpAllowedClientIds: string[]` (`MCP_ALLOWED_CLIENT_IDS`, comma-separated),
  `mcpResourceUrl: string` (`${apiBaseUrl}/mcp`),
  `mcpAccessTokenTtlSeconds` (`MCP_ACCESS_TOKEN_TTL_SECONDS`, default 3600),
  `mcpRefreshTokenTtlSeconds` (`MCP_REFRESH_TOKEN_TTL_SECONDS`, default 2592000).
- `@repo/auth/server`: `auth` includes `jwt()`, `mcp()`, `cimd()` when
  `mcpEnabled`. `loginPage` = `${appUrl}/auth/login`, `consentPage` =
  `${appUrl}/oauth/consent`.
- `@repo/auth/client`: `authClient.oauth2.consent({ accept: boolean })`
  returns `{ data: { redirect: boolean; url: string } | null; error }`.
- Login resume (read from the installed plugin): `/auth/oauth2/authorize`
  redirects to `loginPage` / `consentPage` with the full original authorize
  query plus `exp` and `sig` (signed). After sign-in, the web app must
  navigate back to `${apiBaseUrl}/auth/oauth2/authorize?<same query>`.
  On the consent page, `oauth2.consent` reads the signed query from
  `window.location.search` itself, so the page must still be on that URL
  when calling it. The response is JSON; the page sets
  `window.location.href = data.url` to finish.

### C4: settings REST (slice 3 provides, slice 4 consumes)

Session-authenticated (`authMiddleware`). All return 404 when
`config.mcpEnabled` is false.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/mcp-settings` | | `{ enabled, access, connectorUrl }` |
| PUT | `/mcp-settings` | `{ enabled, access }` | same as GET. `enabled: false` deletes all connections and revokes their grants. |
| GET | `/mcp-settings/connections` | | `{ connections: [{ id, clientId, clientName, workspaceId, workspaceName, createdAt, lastUsedAt }] }` |
| POST | `/mcp-settings/connections` | `{ clientId, workspaceId }` | `{ connection }`. 403 when MCP is disabled for the user. Workspace must be the user's. |
| DELETE | `/mcp-settings/connections/:connectionId` | | 204. Also revokes the client's grants. |

`access` is `McpAccess`. `connectorUrl` is `config.mcpResourceUrl`.

## Wave 1 (parallel)

### Slice 1: database, config, auth

Owns `packages/database/**`, `packages/config/**`, `packages/auth/**`,
`packages/testing/package.json` (better-auth version only),
`pnpm-lock.yaml`, `.env.example` if present.

1. better-auth packages 1.7.5 → 1.7.6. Add `@better-auth/mcp` and
   `@better-auth/cimd` 1.7.6 to `@repo/auth`.
2. Config (C3).
3. Auth plugins (C3). Read the installed plugin sources for option names.
   CIMD client allowlist from `mcpAllowedClientIds`, DCR off, access token
   lifetime 1 hour, refresh 30 days. Client plugin + `AuthClient` type (C3).
4. Plugin tables (`jwks`, OAuth provider tables) as Drizzle schema, matching
   what the installed plugins expect (use the better-auth CLI generator if it
   works, else hand-write from the plugin schema definitions).
5. `mcp_settings`, `mcp_connections`, `mcp_tool_calls` (PRD sections 1, 2,
   "Changes by package"). All new tables registered in `relations.ts`.
6. `DatasetOrigin` + `'mcp'`, `dataset_rows.written_by`, repo params (C1).
7. MCP repos (C1).
8. `pnpm --filter @repo/database db:generate` for the migration. No push.

### Slice 2: shared tool definitions

Owns `packages/ai/src/tools/dataset.tools.ts`,
`packages/ai/src/tools/tool-definition.ts` (new),
`packages/ai/src/tools/index.ts`, `packages/ai/src/services/dataset.service.ts`.

1. C2 types in `tool-definition.ts`.
2. One definition per dataset tool, with `access` and `annotations` per the
   PRD section 5 table. Existing helpers stay.
3. `getDatasetXTool(writer, userId, workspaceId)` keeps its signature and
   becomes a thin adapter (UI event + `execute` with `origin: 'agent'`).
   `agent.tools.ts` must not need changes.
4. Writes pass `writtenBy: ctx.origin`. `createDatasetForAgent` takes an
   `origin` and stamps it. Row outputs include `writtenBy`.
5. Code against C1 as written. Slice 1 adds those params in parallel. If the
   build fails only because C1 isn't there yet, say so in the report.

## Wave 2 (parallel, after wave 1 is verified)

### Slice 3: API

Owns `apps/api/**` (except dataset grid behaviour beyond passing
`writtenBy: 'user'`, which is the default anyway), `apps/api/package.json`.

1. `@modelcontextprotocol/server` in `apps/api`.
2. `/mcp` per PRD section 3: `requireMcpAuth`, connection lookup, settings,
   per-request `McpServer`, `legacy: 'reject'`, own CORS, origin check,
   audit writes, `last_used_at`.
   `controllers/mcp.controller.ts`, `services/mcp.service.ts`,
   `services/mcp-integrations.ts`.
3. Settings REST (C4): `controllers/mcp-settings.controller.ts` + service.
4. Tests in `apps/api/test/mcp/` per PRD "Testing". Run the full suite once
   at the end.

### Slice 4: web

Owns `apps/web/**`.

1. `/settings/mcp` page (PRD section 1) as a `features/mcp/` module, linked
   from the account menu. Hidden when `/mcp-settings` returns 404.
2. `/oauth/consent` page (PRD section 2): disabled state, workspace picker,
   access summary, approve (POST connection, then plugin consent accept) /
   deny.
3. Login resume: after sign-in, return to the pending authorize request.
4. `written_by` badge in the dataset grid for `mcp` rows.
5. i18n `de-DE` and `en-UK`.
