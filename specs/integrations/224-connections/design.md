# Integrations: design

> Design for [prd.md](./prd.md). Story IDs (`US-n`) refer to the PRD. Phase 1 in full, later
> phases only where the model must already fit them.

## Concepts

| Term                 | Lives in                     | Example                                     |
| -------------------- | ---------------------------- | ------------------------------------------- |
| Provider             | code (adapter)               | `google`, `microsoft`, `linkedin`           |
| Integration          | code (catalog)               | `gmail`, `outlook-mail`, `linkedin-posting` |
| User connection      | DB `integration_connections` | Anna's Google account, anna@example.com     |
| Workspace connection | DB `integration_connections` | the Sales workspace's office@example.com    |
| Feature binding      | DB, on the feature's row     | `email_accounts.connection_id`              |

A feature always finds exactly one connection:

- **Bound features** (mailbox, later the shared inbox) store `connection_id`.
- **User features** (LinkedIn publish, later agent tools by default) use the acting user's
  connection for the integration's provider. Unique by the one-per-provider rule (US-1).
- **Explicit workspace choice** (phase 4) stores a workspace connection id on the agent or node.

## Package `@repo/integrations`

Catalog, provider adapters and token service live in one new package. Envelope encryption lives
in its own server-only package, `@repo/crypto`, because `APP_KEY` is meant for any secret at rest,
not only integration tokens. Only `@repo/integrations` writes tokens; apps pass plaintext to it. The
API and the worker both consume it. `@repo/auth` stays better-auth only.

### Catalog

```ts
interface IntegrationDefinition {
  id: IntegrationId; // 'gmail' | 'outlook-mail' | 'linkedin-posting'
  provider: ProviderId; // 'google' | 'microsoft' | 'linkedin'
  category: IntegrationCategory; // 'mail' | 'calendar' | 'files' | 'social'
  authType: 'oauth2'; // 'api_key' later
  scopes: string[]; // what connecting this integration requests
}
```

Display name, description and icon live in the web app (i18n), keyed by `id`. Agent actions are a
later field (phase 4).

### Provider registry

One standards engine, `oauth4webapi` (zero dependencies, OpenID-certified), and one declarative
entry per provider: authorization, token and revocation endpoints, client authentication method,
PKCE on or off, scope separator, extra authorize params (Google: `access_type=offline`,
`prompt=consent`), plus a small `getProfile()`. Quirks go through the engine's hooks
(`customFetch`, `RecognizedTokenTypes`), never through a second HTTP client. A new standard
provider is a config entry. Lost: better-auth's provider factories (standalone use isn't
documented and they have no revoke), `arctic` (deprecated July 2026), and a hand-written client.

Identity comes only from each provider's profile endpoint, called with the access token. Token
responses drop `id_token` before the engine validates them: Microsoft's issuer varies with the
tenant, and nothing in RAGNA Studio trusts the ID token. LinkedIn's refresh response has no
`token_type`, so the same hook defaults it to `Bearer`.

The registry reuses the sign-in OAuth clients (`GOOGLE_CLIENT_ID`, ...). Only a new redirect URI is
added: `{API_URL}/integration/oauth/callback`. Google and Microsoft use PKCE.
`access_type=offline` and `prompt=consent` move from the Google sign-in config to the Google entry,
so sign-in no longer shows a consent screen every time.

## Schema

### `integration_connections`

| Column                                 | Notes                                                          |
| -------------------------------------- | -------------------------------------------------------------- |
| `id`                                   | primary id                                                     |
| `organization_id`                      | FK, cascade. Tenant for the resource guard and org erasure     |
| `user_id`                              | FK, cascade. Owner of a user connection                        |
| `workspace_id`                         | FK, cascade. Owner of a workspace connection (null in phase 1) |
| `created_by_user_id`                   | FK, set null                                                   |
| `provider`                             | `ProviderId`                                                   |
| `external_account_id`                  | provider's stable user id (`sub`)                              |
| `external_email`, `display_name`       | shown in the UI, nullable                                      |
| `scopes`                               | `text[]`, granted scopes as returned by the provider           |
| `access_token`, `refresh_token`        | encrypted envelopes                                            |
| `access_token_expires_at`              | nullable                                                       |
| `status`                               | `active` or `needs_reauth`                                     |
| `auth_failed_at`, `auth_failed_reason` | set with `needs_reauth`                                        |
| `last_refreshed_at`                    |                                                                |
| timestamps                             |                                                                |

- `CHECK (num_nonnulls(user_id, workspace_id) = 1)`: exactly one owner.
- Unique `(user_id, provider)` where `user_id` is not null.
- Unique `(workspace_id, provider, external_account_id)` where `workspace_id` is not null.
- `CHECK` that both token columns are null or start with the envelope prefix.
- Registered in `relations.ts`.

`integration_oauth_states`: `state` (primary key, random), `user_id` (FK, cascade),
`integration_id`, `code_verifier`, `return_path`, `expires_at`. Registered in `relations.ts`.

### Feature bindings

- `email_accounts.connection_id` FK, `ON DELETE CASCADE`. Removing the connection removes the
  mailbox, as disconnecting does today (US-4.2).
- `social_posts.connection_id` FK, set null. Records which connection published, for retries and
  the post history (US-3.2).

## Encryption

AES-256-GCM in a versioned envelope, `enc:v1:<iv>:<tag>:<ciphertext>`. The key is `APP_KEY`
(`base64:` plus 32 random bytes), read through `config.getSecret('APP_KEY')`. It is RAGNA Studio's
own application key, separate from `BETTER_AUTH_SECRET`, and reusable for later secrets at rest. A
key derived from `BETTER_AUTH_SECRET` lost: rotating that secret would have dropped every
connection.

- **Rotation**: `APP_PREVIOUS_KEYS` (comma-separated). Writes use `APP_KEY`. Reads try `APP_KEY`,
  then the previous keys; the GCM tag rejects a wrong key. Each refresh re-encrypts with the
  current key.
- **Generation**: the quickstart installer writes `APP_KEY`. `pnpm key:generate` prints one.
- **Missing key**: the app starts. Connecting fails with "APP_KEY is not set", and a startup log
  line says the same.

## OAuth flow

1. `POST /integration/connect` with `{ integrationId, returnPath }`. The API stores a row in `integration_oauth_states`: random state, user, integration, PKCE
   verifier, `returnPath`, `expires_at` 10 minutes ahead. Postgres, not Redis: the API has no Redis
   client of its own, and the existing cleanup cron deletes expired rows. It returns the authorize URL with the integration's scopes plus the scopes the
   user's connection for that provider already has (US-1.2).
2. The provider redirects to `GET /integration/oauth/callback`. The API consumes the state once
   (`DELETE ... RETURNING`, unexpired only), checks that the signed-in user started it, exchanges the code and reads the profile.
   It enforces the email rule for Google and Microsoft (US-1.3), upserts the user's connection for
   that provider and redirects to `returnPath`.
3. `returnPath` must be a relative app path. Anything else falls back to the connections page.

Mail connect then sends `connectionId` to `POST /email/account/connect`.

## Token service

`getConnectionAccessToken(connectionId)` is the only way the API and the worker get a token.

- It returns the stored token while it's valid for at least 60 more seconds.
- Otherwise it refreshes inside a transaction holding `pg_advisory_xact_lock` on the connection id,
  and re-reads the row after taking the lock. Concurrent callers in the API and the worker share
  one refresh.
- `invalid_grant` or a revoked grant sets `needs_reauth`, notifies the owner once (US-4.4) and
  throws `ConnectionNeedsReauthError`. Mail sync stops for that mailbox (US-2.2).
- No caller keeps a token beyond one call.
- API responses use a connection DTO without token fields (US-1.5).

## Removing a connection

`DELETE /integration/connection/:connectionId` revokes the grant at the provider where possible,
then deletes the row. Bindings follow their FK. Disconnecting the mailbox removes its connection the same way. Once a
second integration shares that connection (calendar), disconnect must only unbind the mailbox. Offboarding (`prepareUserRemoval`) revokes and
deletes the user's connections (US-4.5) and replaces `revokeProviderGrants` /
`clearAccountTokensByUserIdAndProviders`.

## Identity hardening (US-5, end of phase 1)

- `accountLinking.allowDifferentEmails: false`.
- Unique index on `account (user_id, provider_id)`.
- Sign-in scopes: `openid profile email` for Google, Microsoft and LinkedIn (US-2.3, US-3.3).
- `LINKEDIN_SCOPES` is deprecated: logged as ignored for one release, then removed.
- `getAccountByUserIdAndProvider`, `listAccountsByUserIdAndProvider` and
  `clearAccountTokensByUserIdAndProviders` are deleted.

## Migration

No token backfill: the only known production instance has no mailbox or LinkedIn connection.

- A generated migration adds the tables and nullable `email_accounts.connection_id` and
  `social_posts.connection_id`. Mailbox rows without a connection are deleted in the same
  migration (US-2.4). Release notes say so.
- Before the unique index on `account`, plain SQL keeps the oldest row per user and provider and
  deletes the newer ones.
- A follow-up migration makes `email_accounts.connection_id` `NOT NULL`.

## API

| Route                                          | Purpose                                         |
| ---------------------------------------------- | ----------------------------------------------- |
| `GET /integration/catalog`                     | integrations the caller can connect             |
| `GET /integration/connection`                  | the caller's connections, without tokens        |
| `POST /integration/connect`                    | start the OAuth flow, returns the authorize URL |
| `GET /integration/oauth/callback`              | provider redirect target                        |
| `DELETE /integration/connection/:connectionId` | revoke and remove                               |

Workspace connections (phase 3) go under `/workspace/:workspaceId/integration/...`, following
`specs/api-standards/prd.md`. Every repository write goes through the resource guard.

## Web

- **Settings, Connections** (new): provider, email, integrations using it, status, "Reconnect",
  "Remove". Notes that removing one integration doesn't narrow granted scopes.
- **Email settings**: connect goes through `POST /integration/connect` instead of `linkSocial`.
  `needs_reauth` shows a reconnect banner.
- **Social posts**: publish without a LinkedIn connection offers "Connect LinkedIn".
- **Account page**: sign-in providers only, no feature scopes.

## Later phases: what the model must already fit

- **Phase 2, organization policy:** `organization_integrations (organization_id, integration_id,
  enabled)`, overrides only. One check in `@repo/integrations`, called by connect, mail sync,
  publish and the toolset builder. Disabling pauses use; connections stay.
- **Phase 3, workspace connections (#190):** `workspace_id` set, `user_id` null. `email_accounts`
  gets `workspace_id`; uniqueness becomes one mailbox per user plus any number per workspace.
- **Phase 4, agent tools.** Run user as the code has it: the chatting user, `triggeredByUserId` for
  a manual run, the author for a scheduled run (`resolveScheduledRunUserId`). A run uses only its
  run user's connection and the workspace connections of its own workspace, never another user's.
  `AgentToolContext` and `WorkflowToolContext` get a resolver that resolves when the tool
  executes. Tools stay visible when the run user isn't connected and return "not connected".
  Tool results and workflow steps record the connection id, never the token.

## Risks

- **Redirect URI change.** Self-hosters must add the callback URI to their provider apps. The docs
  page and a startup log line name it.
- **Incremental scopes** must be verified per provider, especially LinkedIn (the open check from
  #153).
