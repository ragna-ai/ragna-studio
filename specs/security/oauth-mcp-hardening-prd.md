# OAuth and MCP hardening

Status: in-progress (2026-10-16). Decisions settled 2026-10-16. Branch `fix/oauth-mcp-hardening`.
Source: OAuth/MCP audit against the investigation checklist, see [backlog](../backlog.md).

## Summary

An audit of RAGNA Studio's OAuth grants (Google, Microsoft, LinkedIn) and its MCP server against
an OAuth/MCP investigation checklist found the MCP authorization layer in good shape. CIMD
allowlist, no DCR, audience-bound JWTs, `iss` in the authorization response, hashed tokens,
per-request connection check. Three hygiene gaps are in scope here, a fourth is deferred.

| #   | Item                                                     | Risk   | Area                  | Slice |
| --- | -------------------------------------------------------- | ------ | --------------------- | ----- |
| 1   | MCP audit log is deleted on revoke, reads not logged     | Medium | database, api, worker | B     |
| 2   | Mail tokens stay stored after disconnect and offboarding | Medium | api, database         | A     |
| 3   | MCP consent page hides the redirect URI host             | Low    | web                   | B     |
| -   | LinkedIn sign-in requests posting rights up front        | Low    | deferred, see backlog | -     |

None of these items needs a change to the better-auth configuration, and none depends on the
better-auth 1.8 upgrade ([gap analysis](../auth/better-auth-1.8-gap-analysis.md)).

## Decisions

Settled 2026-10-16. Do not re-open them.

| Decision                    | Choice                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Audit row columns           | Copy `user_id`, `client_id`, `workspace_id` onto each row. Add `resource_id` and `access`. Tool arguments stay out. |
| Audit retention             | 90-day constant in `apps/worker/src/crons/cleanup.cron.ts`. No env var.                                             |
| LinkedIn incremental scopes | Moved to the backlog. Needs a LinkedIn test app first, nobody asked for it.                                         |
| Consent page                | Ships with item 1 (both MCP).                                                                                       |
| Microsoft token race        | Delete the mailbox row first, then clear tokens. Document the remaining window, no worker check.                    |
| Mail token `scope` reset    | Set `account.scope` to `null`. `getMailProviderScopeStatus` then reports "reconnect", sign-in ignores it.           |
| Member removal              | Runs the same path as a mailbox disconnect, plus clears every Google/Microsoft token of that user.                  |
| better-auth 1.8             | Separate work, after 1.8 is stable.                                                                                 |

## 1. MCP audit trail survives revocation

**Today:** `mcp_tool_calls.connection_id` references `mcp_connections.id` with
`onDelete: 'cascade'` (`packages/database/src/schema/mcp.schema.ts`). Revoking a connection
(settings, master toggle, member removal via `revokeMcpAccess`) deletes its tool-call history.
Only `write` tools are recorded (`recordMcpToolCallOutcome` in
`apps/api/src/services/mcp.service.ts`), reads only touch `last_used_at`.

**Change:**

- Schema (`mcp_tool_calls`), done before the slices start:
  - `connection_id` nullable, `onDelete: 'set null'`.
  - `user_id` (not null, FK `user.id`, cascade), `client_id` (not null), `workspace_id` (not
    null, FK `workspace.id`, cascade). Copied from the connection at insert.
  - `resource_id` (nullable text): the `datasetId` from the tool input when present.
  - `access` (not null, `read` | `write`).
  - Indexes on `user_id` and `created_at`.
  - Migration via `db:generate`, with a backfill of the copied columns from the current join.
    Existing rows get `access = 'write'`.
- `recordMcpToolCallOutcome` records every call, with `access` from `definition.access`.
- `recordMcpToolCall` in `mcp.repo.ts` takes the new fields. The connection scope already holds
  `userId`, `clientId` and `workspaceId`.
- Retention: `cleanup.cron.ts` gets a step that deletes rows older than 90 days, through a new
  `deleteMcpToolCallsOlderThan({ date })` repo function.
- No UI change. Anything reading counts by `connection_id` keeps working.

**Test (api):** revoke a connection that has tool calls. Rows remain with `connection_id` null
and the right `user_id`, `client_id`, `workspace_id`. A read tool call creates a row with
`access = 'read'` and the `resource_id` of the dataset.
**Test (worker):** the cleanup cron deletes only tool-call rows past the cutoff.

## 2. Mail tokens: clear and revoke on disconnect and offboarding

**Today:**

- `disconnectEmailAccount` (`apps/api/src/services/email.service.ts`) deletes the mailbox row and
  its data. The linked `account` row (`google` / `microsoft`) keeps its encrypted access and
  refresh token with `gmail.modify` or `Mail.ReadWrite` + `Mail.Send`.
- Member removal (`removeMemberForUser` and `leaveOrganization` in
  `apps/api/src/services/organization.service.ts`, both calling `softDeleteMemberAccount`) bans
  the user, ends sessions, revokes MCP. Mail sync stops, but the provider tokens stay.
- Nothing calls a provider revocation endpoint.

**Change:**

- New api service `apps/api/src/services/provider-grant.service.ts` with
  `revokeProviderGrants({ userId, providerIds })`:
  - Google: get a token through `auth.api.getAccessToken` and `POST` it to
    `https://oauth2.googleapis.com/revoke`. Revoking the access token revokes the whole grant,
    sign-in scopes included. We never decrypt the refresh token ourselves. The next Google
    sign-in asks for consent again, which is fine.
  - Microsoft: Entra has no client-side revocation endpoint for delegated tokens. Local
    clearing is the control. Admins revoke the grant in Entra under Enterprise applications
    (document in `apps/docs`).
  - Best effort: a failed provider call is logged, never blocks the disconnect.
  - Then one repo call nulls `access_token`, `refresh_token`, `id_token`,
    `access_token_expires_at`, `refresh_token_expires_at` and `scope` on the matching `account`
    rows. The rows stay: they are the login identity.
- `disconnectEmailAccount`: delete the mailbox row first (sync stops picking it up), then
  `revokeProviderGrants` for the mailbox's provider.
- Member removal: after `softDeleteMemberAccount` commits, delete the member's mailbox row if
  any, then `revokeProviderGrants` for `google` and `microsoft`. `@repo/database` stays free of
  HTTP calls.
- Restore (`restoreMemberAccount`) needs no change. The user reconnects the mailbox.
- **Known window:** a sync job already running can refresh and store a token after we cleared
  it. For Google the grant is revoked, so that token is dead. For Microsoft a live token can
  remain until the next disconnect. Accepted.
- Out of scope: tokens of mailboxes disconnected before this ships. A one-time cleanup can
  follow if wanted.

**Test (api):** disconnect clears the token columns and calls the (mocked) Google revoke
endpoint once. A failing revoke still disconnects and clears. Microsoft disconnect makes no
provider call and clears. Member removal and leaving clear tokens for that member only.

## 3. MCP consent page: show where the code goes

**Today:** `apps/web/app/pages/oauth/consent.vue` shows the client name and the CIMD host. It
does not show the `redirect_uri` host. The MCP spec asks authorization servers to show it,
especially for `localhost` redirects. The allowlist (`MCP_ALLOWED_CLIENT_IDS`) limits this to
known clients, so the risk is low.

**Change:** read `redirect_uri` from the route query. better-auth 1.7.7 already forwards the
full authorize query to the consent page, signed (`signParams` in `@better-auth/oauth-provider`),
so it is there and tamper-evident. Show its host under the client label. For `localhost`,
`127.0.0.1` and `[::1]`, show a short warning that the app runs on this computer. New i18n
strings in every locale the page already uses.

**Test:** manual check by Sven (no web component tests in the repo).

## Slices

Two Sonnet workers in parallel. The schema change and migration for item 1 land first, done by
the lead, so no worker runs `test:setup` (it recreates the shared test DB).

### Slice A: mail tokens (item 2)

- Files: `apps/api/src/services/provider-grant.service.ts` (new), `email.service.ts`,
  `organization.service.ts`, a repo function in `packages/database/src/repositories/` next to
  `getAccountByUserIdAndProvider`, tests under `apps/api/test/email/` and
  `apps/api/test/organization/`.
- Mock the Google revoke call at the `fetch` level.
- Docs: one paragraph in the email feature guide in `apps/docs` about disconnect and the Entra
  step.

### Slice B: audit trail and consent host (items 1 and 3)

- Files: `apps/api/src/services/mcp.service.ts`, `packages/database/src/repositories/mcp.repo.ts`,
  `apps/worker/src/crons/cleanup.cron.ts`, `apps/web/app/pages/oauth/consent.vue` plus i18n,
  tests under `apps/api/test/mcp/` and `apps/worker/test/crons/cleanup-cron.test.ts`.

Both: TDD, run their own tests, `pnpm check-types` before reporting. No commits.

## Found during testing: OAuth discovery routing

Connecting Claude Code to a local MCP server failed. `GET /.well-known/*` was never forwarded to
`auth.handler`, although the [MCP PRD](../mcp/prd.md) requires it. And `wsController` had no base
path, so its origin check ran for every unmatched route and returned 403 instead of 404.

Fixed in the same PR: `apps/api/src/app.ts` forwards `/.well-known/*`, `wsController` uses
`.basePath('/ws')`. Tests pin the discovery metadata (no `registration_endpoint`) and a 404 for
unknown routes. Production likely had the same gap. After deploy, check
`/.well-known/oauth-protected-resource/mcp` on the api host and connect Claude Desktop once.

## Out of scope

- LinkedIn incremental scopes (backlog).
- DPoP-bound MCP tokens (better-auth supports it, Claude does not send DPoP yet).
- Google OAuth verification / CASA and Microsoft Publisher Verification: process, not code.
- Frame protection for the consent page: owned by Traefik, outside this repo.
