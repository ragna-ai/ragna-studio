# MCP server: Ragna as a connector for Claude Desktop

> **Status: in-progress** (approved 2026-09-24, building on `feat/mcp-server`, see [slices.md](./slices.md)). A remote MCP server in
> `apps/api` that lets Claude Desktop read and write Ragna resources on the
> user's behalf. Datasets are the first integration. The layer is generic so
> tasks, documents and others can follow.

Related: [datasets/datasets.md](../datasets/datasets.md) (the first
integration, especially decision 11 on the workspace hard filter),
[agent/agent-tool-discovery.md](../agent/agent-tool-discovery.md) (the
opposite direction: Ragna agents consuming external MCP servers, not in
scope here).

## Goal

A user adds Ragna as a custom connector in Claude Desktop. After an OAuth
sign-in, Claude can work with the user's datasets in one workspace: find
them, read rows, append and update rows, create new datasets. The user
controls exactly what is exposed on a settings page. Nothing is exposed until
they turn it on.

## Decisions (Sven, 2026-09-24)

| #   | Topic                | Decision                                                                                                                                               |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Target client        | Claude Desktop custom connectors. That requires OAuth (MCP authorization spec). Personal access tokens are not built.                                  |
| 2   | Scope of the layer   | Generic MCP layer with an integration registry. Datasets are the first integration, not the only one.                                                  |
| 3   | Opt-in               | A `/settings/mcp` page with a master toggle, off by default. Per resource type: **Off / Read / Read & write**.                                         |
| 4   | Workspace            | Picked on the OAuth consent screen. One workspace per connection. See P9 for how many connections a client can have.                                   |
| 5   | Granularity          | Resource type level only. "Datasets: Read" means all datasets in the connected workspace are readable. No per-dataset exceptions.                      |
| 6   | v1 access            | Read and write.                                                                                                                                        |
| 7   | Tool source of truth | Each tool is defined once as a transport-neutral definition in `@repo/ai`. Thin adapters turn it into an AI SDK tool (chat, workflows) or an MCP tool. |

## Decisions from proposals (approved 2026-09-24)

| #   | Topic                  | Proposal                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Where permissions live | Settings are the only permission source. Access tokens only carry user, client and connection. Every `tools/list` and `tools/call` reads the current settings, so changes apply on the next call without re-auth.                                                                                                                       |
| P2  | Kill switch            | `MCP_ENABLED` in `@repo/config`. Off: `/mcp`, the OAuth provider endpoints and the settings page are unavailable.                                                                                                                                                                                                                       |
| P3  | Master toggle off      | Turning MCP off in settings revokes all connections and their tokens. Turning it on again starts from zero.                                                                                                                                                                                                                             |
| P4  | Client registration    | Client ID metadata documents (CIMD) via `@better-auth/cimd`, restricted to an allowlist of client ID URLs in config (Claude's by default). Dynamic client registration stays off, unless Claude Desktop turns out not to support CIMD. Then DCR goes on with a redirect URI allowlist instead.                                          |
| P5  | Tool surface           | No delete tools. The seven existing dataset tools, nothing more.                                                                                                                                                                                                                                                                        |
| P6  | Provenance             | `datasets.origin` gains `'mcp'`. `dataset_rows` gains `written_by` (`user` / `agent` / `mcp`), set on every write. The grid shows a badge for MCP-written rows.                                                                                                                                                                         |
| P7  | Audit                  | Every write call is recorded in `mcp_tool_calls`. Reads only update `last_used_at` on the connection.                                                                                                                                                                                                                                   |
| P8  | Rate limit             | None on `/mcp` in v1 (Sven, 2026-09-24). better-auth already rate-limits its own `/auth/*` OAuth endpoints (per IP, in memory, production only). An IP key is wrong for `/mcp` because Claude traffic arrives from shared Anthropic IPs; if a limit is needed later, key it per connection.                                             |
| P9  | Connections per client | One connection per (user, client). The access token carries the user (`sub`) and the client, not a workspace, so two Claude connections to different workspaces would be indistinguishable. Switching workspace means revoking and reconnecting. Several workspaces per client would need a custom access-token claim, see "To verify". |

## Non-goals

- Personal access tokens or API keys.
- Per-dataset or per-workspace permissions on the settings page.
- Ragna agents calling external MCP servers.
- MCP resources, prompts, sampling, or server-to-client notifications. Tools only.
- Exposing tools that cost credits (imagegen, videogen, websearch). They need a credit decision first.
- Clients other than Claude Desktop (they may work, but are not tested or allowlisted).

## Overview

```
Claude Desktop
  │ 1. POST /mcp without token  ──► 401 + WWW-Authenticate (resource metadata URL)
  │ 2. discovery (RFC 9728 / 8414), client identified via CIMD
  │ 3. /auth/oauth2/authorize ──► Ragna login (if needed) ──► consent page (apps/web)
  │                                   pick workspace, see allowed access, approve
  │ 4. token exchange (PKCE)
  │
  └─► POST /mcp  Authorization: Bearer <JWT>
        ├─ requireMcpAuth: signature, expiry, audience = /mcp
        ├─ load connection (sub + client) + current MCP settings
        └─ tools/list | tools/call ──► integration registry
                                          └─ datasets ──► ToolDefinition.execute
```

## Design

### 1. Settings page (`/settings/mcp`)

There is no settings area in `apps/web` today (`/account` is the closest).
This PRD creates `/settings/mcp` as the first page of one. Linked from the
account menu.

Content:

- **Master toggle:** "Allow external AI apps to access Ragna (MCP)". Off by
  default. Turning it off asks for confirmation, then revokes every
  connection (P3).
- **Connector URL:** the `/mcp` URL to paste into Claude Desktop, with a copy
  button and a one-line how-to.
- **Resource access:** one row per registered integration. v1 has one row:
  Datasets, with **Off / Read / Read & write**. New integrations appear here
  as new rows, always `off` by default.
- **Connected apps:** client name, workspace, connected at, last used,
  **Revoke** button.

Storage: one row per user in `mcp_settings`:

| Column     | Type                                                      | Notes                   |
| ---------- | --------------------------------------------------------- | ----------------------- |
| `user_id`  | text PK, FK user, cascade                                 |                         |
| `enabled`  | boolean, default false                                    | Master toggle           |
| `access`   | jsonb `Record<IntegrationId, 'off' \| 'read' \| 'write'>` | Missing key means `off` |
| timestamps |                                                           |                         |

jsonb keeps new integrations a code change, not a migration.

### 2. OAuth

Ragna becomes the authorization server via better-auth's
[MCP plugin](https://better-auth.com/docs/plugins/mcp):

```ts
plugins: [
  jwt(),
  mcp({ loginPage, consentPage, resource: `${apiBaseUrl}/mcp` }),
  cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
];
```

- `@better-auth/mcp` builds on `@better-auth/oauth-provider` and **is** the
  OAuth provider. `oauthProvider()` must not be registered as well.
- All three packages are at 1.7.6 and peer on `better-auth ^1.7.6`, so all
  better-auth packages move from 1.7.5 to 1.7.6.
- The plugin adds the OAuth provider tables (`oauthClient`,
  `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent`,
  `oauthClientAssertion`, plus `oauthResource` and `oauthClientResource`
  because `mcp()` links every client to the resource) and `jwt()` adds `jwks`.
  Token lifetimes come from `MCP_ACCESS_TOKEN_TTL_SECONDS` and
  `MCP_REFRESH_TOKEN_TTL_SECONDS`.

Flow details:

- **Discovery.** `requireMcpAuth` answers unauthenticated requests with
  `401` and a `WWW-Authenticate` header pointing at the protected resource
  metadata (RFC 9728). The plugin serves that and the authorization server
  metadata (RFC 8414) from its `onRequest` hook at the root
  `/.well-known/*` paths. `apps/api` must forward `/.well-known/*` to
  `auth.handler`, next to `/auth/*`, or discovery is unreachable.
- **Client identity.** CIMD (P4): the client's id is an HTTPS URL to its
  metadata document, fetched by `@better-auth/cimd`. Only client ID URLs in
  `MCP_ALLOWED_CLIENT_IDS` are accepted. The `mcp-2026-07-28` metadata
  profile keeps dynamic client registration from switching on implicitly.
- **Login.** The existing login page (`/auth/login`, Google / Microsoft /
  LinkedIn) is reused. After sign-in the user must land back in the pending
  authorize request, not on the home page.
- **Consent page** (`apps/web`, e.g. `/oauth/consent`):
  - If MCP is disabled in settings: explain and link to `/settings/mcp`. No
    approve button.
  - Otherwise: client name and redirect host, a workspace picker (the user's
    workspaces), a read-only summary of current access ("Datasets: Read &
    write"), Approve / Deny.
  - Approve creates the `mcp_connections` row, then completes the
    authorization.
- **Tokens.** Access tokens are JWTs (the `jwt()` plugin), short-lived
  (1 hour), audience bound to the `/mcp` resource. JWTs can't be revoked
  before they expire, so the connection lookup on every request (section 3)
  is what makes revoke immediate. Refresh tokens rotate (30 days) and live
  in the plugin's tables.
- **Scopes.** `mcp` plus `offline_access`. The plugin only issues refresh
  tokens when `offline_access` is granted. Real permissions come from
  settings (P1).
- **Session cookies are never accepted on `/mcp`.** Bearer only. OAuth
  access tokens are not accepted anywhere else in `apps/api`
  (`authMiddleware` stays session-only).

`mcp_connections`:

| Column         | Type                  | Notes                                          |
| -------------- | --------------------- | ---------------------------------------------- |
| `id`           | text PK               |                                                |
| `user_id`      | FK user, cascade      |                                                |
| `client_id`    | text                  | The CIMD client ID URL (the `client_id` claim) |
| `workspace_id` | FK workspace, cascade | Deleting the workspace kills the connection    |
| `last_used_at` | timestamp, nullable   |                                                |
| timestamps     |                       |                                                |

Unique on (`user_id`, `client_id`) (P9). Approving consent for a client that
already has a connection replaces its workspace. Revoke deletes the row and
revokes the client's refresh tokens and consent for the user. Tokens are
resolved to a connection on every request (`sub` + `client_id` claims). No
connection, no access, even with a valid token.

### 3. MCP endpoint (`apps/api`)

- **Transport:** Streamable HTTP, stateless, MCP protocol `2026-07-28`
  only (`legacy: 'reject'`, as the plugin docs require). `POST /mcp` handles
  JSON-RPC. Other methods return 405.
- **SDK:** `@modelcontextprotocol/server` v2. Its `createMcpHandler` is
  Web-standard (`Request` in, `Response` out), so it mounts in Hono directly,
  wrapped by `requireMcpAuth`. The `McpServer` is built **per request**, with
  only the tools the connection may use right now registered via
  `registerTool`. That is how the tool list follows the settings. The SDK
  uses zod v4 (`^4.2.0`), same as us, so the definitions' schemas are passed
  as they are.
- **CORS:** its own policy on `/mcp`. No credentials. Requests with an
  `Origin` header outside the allowlist are rejected (MCP spec requirement
  against DNS rebinding).
- **Files:** `controllers/mcp.controller.ts` (routes only),
  `services/mcp.service.ts` (token to connection, permission check, adapter,
  audit), `services/mcp-integrations.ts` (the registry).

Per request:

1. `requireMcpAuth` verifies the JWT (signature, expiry, audience). Invalid:
   401 with `WWW-Authenticate`.
2. Load the connection by the `sub` and `client_id` claims, plus
   `mcp_settings`. Missing connection or MCP disabled: 401, so the client
   re-auths and the user sees the consent page explaining why.
3. Build the `McpServer`: all tools of integrations with `read`, plus write
   tools of integrations with `write`. The SDK answers `tools/list` from it
   and validates `tools/call` input against the zod schema.
4. Each registered tool executes its definition with
   `{ userId, workspaceId, origin: 'mcp' }`, records writes (P7) and updates
   `last_used_at`. A call to a tool that is not registered (removed since
   the client listed it) gets the SDK's own unknown-tool error.

Result mapping: an `{ error }` output becomes `isError: true` with the message
as text content. Any other output becomes `structuredContent` plus the same
JSON as text content.

Claude Desktop fetches the tool list mostly on connect. After a settings
change it may still offer a tool that is no longer allowed. The call then
fails with the SDK's unknown-tool error. Accepted.

### 4. Shared tool definitions (`@repo/ai`)

Today every dataset tool is a factory `getDatasetXTool(writer, userId,
workspaceId)` returning an AI SDK `tool()`. The business logic is already
transport-neutral. Only the `writer` UI event and the AI SDK wrapper are
chat-specific, and read/write access is not recorded anywhere.

New shape:

```ts
export type ToolAccess = 'read' | 'write';
export type ToolOrigin = 'agent' | 'mcp';

export interface ToolContext {
  userId: string;
  workspaceId: string;
  origin: ToolOrigin;
}

export interface ToolDefinition<Input, Output> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  access: ToolAccess;
  execute: (input: Input, ctx: ToolContext) => Promise<Output>;
}
```

- `dataset.tools.ts` exports one definition per tool plus
  `datasetToolDefinitions`. The existing helpers (`loadDatasetInScope`,
  `withDatasetRowLock`, output mappers) stay as they are.
- `getDatasetXTool(writer, userId, workspaceId)` keeps its signature. It
  becomes a thin adapter: write the `data-dataset` UI event, call
  `definition.execute(input, { userId, workspaceId, origin: 'agent' })`.
  `agent.tools.ts` and the web UI don't change.
- The MCP adapter lives in `apps/api` (section 3), not in `@repo/ai`, so
  `@repo/ai` gets no MCP dependency.
- Some descriptions mention workflows or the pinned default dataset. They
  read fine for Claude Desktop. If one doesn't, the definition gets an
  optional `mcpDescription`.
- Other tool families (tasks, documents) move to this shape when they become
  MCP integrations, not before.

### 5. Datasets integration (v1)

| Tool               | Access | MCP annotations                       |
| ------------------ | ------ | ------------------------------------- |
| `datasetFind`      | read   | `readOnlyHint`                        |
| `datasetListRows`  | read   | `readOnlyHint`                        |
| `datasetGetRow`    | read   | `readOnlyHint`                        |
| `datasetCreate`    | write  |                                       |
| `datasetAppendRow` | write  |                                       |
| `datasetUpdateRow` | write  | `destructiveHint` (overwrites values) |
| `datasetMoveRow`   | write  | `idempotentHint`                      |

All existing guardrails apply unchanged: workspace hard filter, schema
validation, 1,000 rows / 20 columns, list limit 100, soft deletes only.

Provenance (P6):

- `DatasetOrigin` becomes `'user' | 'agent' | 'mcp'`. `datasetCreate`
  stamps `ctx.origin`.
- `dataset_rows.written_by` (`'user' | 'agent' | 'mcp'`, default `'user'`)
  is set on create, update and move, by the grid and by tools.
- The grid shows a small badge on rows last written via MCP.
- Tool row outputs include `writtenBy`, so internal agents can see which rows
  came from outside.

### 6. Security

| Risk                                  | Mitigation                                                                                                                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exposure without intent               | Kill switch, master toggle off by default, every integration off by default.                                                                                                                                                                          |
| Cross-site use of the browser session | `/mcp` ignores cookies. Bearer only. Origin check.                                                                                                                                                                                                    |
| Token replay from other services      | Audience-bound tokens, verified on every request.                                                                                                                                                                                                     |
| Stolen token                          | 1 hour lifetime, rotating refresh, revoke in settings, connection lookup on every call. DPoP (supported by the plugin) is possible later if Claude supports it.                                                                                       |
| Rogue clients                         | CIMD with a client ID allowlist, no open registration (P4). Consent page shows client name and redirect host.                                                                                                                                         |
| Legacy protocol downgrade             | `legacy: 'reject'`, `2026-07-28` only.                                                                                                                                                                                                                |
| Stale permissions in tokens           | Permissions read live from settings (P1).                                                                                                                                                                                                             |
| Wrong-workspace writes                | One workspace per connection. Existing workspace hard filter in the tools.                                                                                                                                                                            |
| Data loss                             | No delete tools. Soft deletes only in the grid.                                                                                                                                                                                                       |
| Abuse or runaway loops                | Existing size caps (list limit 100, 1,000 rows per dataset). No `/mcp` rate limit in v1 (P8).                                                                                                                                                         |
| Prompt injection into internal agents | Rows written via MCP are marked (`written_by`), visible in the grid and in tool outputs. Workflow agents following an `instructions` column can be steered by an external writer. This is visible, not prevented. Turning Datasets to Read closes it. |
| Data leaving Ragna                    | Explicit opt-in per resource type. The settings page states that exposed data is sent to the connected app's AI provider.                                                                                                                             |

## Changes by package

| Area             | Change                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@repo/config`   | `MCP_ENABLED`, `MCP_ALLOWED_CLIENT_IDS`                                                                                                                                                                |
| `@repo/auth`     | better-auth 1.7.5 → 1.7.6, plugins `jwt()`, `mcp()` (`@better-auth/mcp`), `cimd()` (`@better-auth/cimd`): login page, consent page, resource, token lifetimes. Plugins only active when `MCP_ENABLED`. |
| `@repo/database` | `mcp_settings`, `mcp_connections`, `mcp_tool_calls`, the plugin's OAuth tables, `DatasetOrigin` + `'mcp'`, `dataset_rows.written_by`. All registered in `relations.ts`. Migration via `db:generate`.   |
| `@repo/ai`       | `ToolDefinition` / `ToolContext`, dataset tools refactored to definitions + AI SDK adapter, `writtenBy` in row outputs                                                                                 |
| `apps/api`       | `@modelcontextprotocol/server`, `/mcp` controller + service + integration registry, `/mcp` CORS and origin check, settings + connections REST endpoints                                                |
| `apps/web`       | `/settings/mcp`, `/oauth/consent`, login return-to for the authorize flow, `written_by` badge in the dataset grid, i18n (`de-DE`, `en-UK`)                                                             |

`mcp_tool_calls`: `id`, `connection_id` (FK, cascade), `tool_name`,
`is_error`, `created_at`. No inputs or outputs stored.

## Testing

`apps/api` integration tests, grouped under an `mcp` domain:

- No token, bad token, wrong audience: 401 with `WWW-Authenticate`.
- A valid session cookie without a bearer token: 401.
- MCP disabled, or connection revoked: 401.
- `Datasets: Read`: `tools/list` has no write tools; a write call returns the
  "not allowed" tool error.
- `Datasets: Read & write`: append and update work, rows carry
  `written_by = 'mcp'`, the call is in `mcp_tool_calls`.
- Workspace isolation: a dataset in another workspace is "not found".
- Existing chat dataset tool tests stay green (adapter keeps behavior).

The OAuth dance itself is tested manually with Claude Desktop.

## To verify during implementation

- **Blocking: Claude Desktop compatibility.** Does it speak MCP `2026-07-28`
  (otherwise `legacy: 'reject'` locks it out) and does it identify via
  CIMD (otherwise P4 falls back to DCR)? Test first, before building the
  rest. Also: Claude's client ID URL for the allowlist.
- Consent page API: how the page accepts consent, and where to hook in
  creating the `mcp_connections` row on approve.
- Login resume: how `loginPage` returns into the pending authorize request
  after a Google / Microsoft / LinkedIn round trip.
- Custom access-token claims: if the plugin supports them, a
  `connection_id` claim would allow several workspaces per client (P9).
- The `mcp()` plugin's own dependency on `@better-auth/oauth-provider`
  resolving to the same 1.7.6 as the rest (injected workspace deps).
- Whether Claude Desktop re-fetches `tools/list` during a conversation.

## Resolved questions (2026-09-24)

1. Settings location: a new `/settings` area, `/settings/mcp` is its first page.
2. P6 `written_by`: in v1, with the grid badge.
3. P7 audit: write calls only. No retention job yet.
4. P9: one workspace per Claude connection, reconnect to switch.
