# Integrations phase 1: slices

> Build plan for [prd.md](./prd.md) and [design.md](./design.md). Every slice follows AGENTS.md
> and loads the clean-code skill, plus tdd for `apps/api` and the packages it reaches. Docs follow
> the docs-writing skill. Slices run in order; each one runs its own tests before the next starts.

## Contracts shared by all slices

```ts
// @repo/integrations
type ProviderId = 'google' | 'microsoft' | 'linkedin';
type IntegrationId = 'gmail' | 'outlook-mail' | 'linkedin-posting';

getConnectionAccessToken({ connectionId }): Promise<string>; // throws ConnectionNeedsReauthError
class ConnectionNeedsReauthError extends Error { connectionId: string }

// API DTO, never with tokens: a zod schema in @repo/integrations/catalog, type via z.infer
integrationConnectionDtoSchema = z.object({
  id, provider: providerIdSchema, externalEmail, displayName, scopes,
  integrations: z.array(integrationIdSchema), status: connectionStatusSchema, createdAt,
});
```

## S1 Core (US-1.1 to US-1.5)

- Scaffold `@repo/integrations` with `pnpm gen package`. Catalog, declarative provider registry on
  `oauth4webapi` for Google, Microsoft and LinkedIn (reuse `@repo/linkedin` for LinkedIn REST calls), token service with the
  advisory lock. Envelope crypto in its own package `@repo/crypto`.
- `@repo/config`: `APP_KEY`, `APP_PREVIOUS_KEYS` as secrets. Root script `key:generate`.
- `@repo/database`: schema `integration_connections`, `integration_oauth_states`, relations,
  repository. Migration via `db:generate`.
- `apps/api`: controller `/integration/*` (catalog, list, connect, callback). Thin controller,
  logic in services.
- Cleanup cron in `apps/worker` deletes expired OAuth states.
- Owns: `packages/integrations/`, the new schema and repo files, `apps/api/src/{controllers,
  services}/integration*`, `apps/api/test/integration/`.

## S2 Manage connections (US-4.1 to US-4.4)

- `DELETE /integration/connection/:connectionId` with provider revoke where supported.
- `needs_reauth` notification, once per connection.
- `apps/web`: Settings, Connections page (list, reconnect, remove with the warning of US-4.2,
  the manual-removal hint of US-4.3).
- Owns: `apps/web/app/features/integrations/`, plus the S1 API files.

## S3 Mail on connections (US-2.1, US-2.2, US-2.4)

- `email_accounts.connection_id`. Migration deletes mailboxes without a connection; follow-up
  migration sets `NOT NULL`.
- `email-provider.service.ts` and `apps/worker/src/mail/mail-provider.ts` resolve tokens through
  `connection_id` only. Sync stops on `ConnectionNeedsReauthError`.
- Web email connect uses `POST /integration/connect`, then binds `connectionId`. Reconnect banner.
- Owns: email services, controller and tests in `apps/api` and `apps/worker`,
  `apps/web/app/features/email/`.

## S4 LinkedIn on connections (US-3.1, US-3.2)

- `social_posts.connection_id`. Publish resolves the user's `linkedin` connection.
- Web publish offers "Connect LinkedIn" when none exists.
- Owns: `social-post.service.ts`, its tests, `apps/web/app/features/social*/`.

## S5 Identity hardening and offboarding (US-2.3, US-3.3, US-4.5, US-5.1, US-5.2)

- `packages/auth/src/server/auth.ts`: `allowDifferentEmails: false`, sign-in scopes
  `openid profile email`, Google offline/consent removed, `LINKEDIN_SCOPES` logged as ignored.
- Migration: keep the oldest `account` row per user and provider, then the unique index.
- `prepareUserRemoval` revokes and deletes connections. Delete `getAccountByUserIdAndProvider`,
  `listAccountsByUserIdAndProvider`, `clearAccountTokensByUserIdAndProviders`,
  `provider-grant.service.ts`, and their fixtures in `@repo/testing`.
- Web account page: sign-in providers only.

## S6 Docs and bookkeeping

- `apps/docs`: `integrations/email.mdx`, `integrations/social-posts.mdx`, new
  `integrations/connections.mdx`, `self-hosting/optional-providers.mdx` (callback URI),
  `reference/environment-variables.mdx`.
- `.env.example` and `scripts/install.sh` generate `APP_KEY`.
- PRD status to `implemented` is set when the PR merges, not by the slice.
