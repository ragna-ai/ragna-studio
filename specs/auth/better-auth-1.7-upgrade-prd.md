# Better Auth 1.7 upgrade

Status: decided (2026-08-20). Design agreed via discussion, not built yet.

`@repo/auth` (`packages/auth/src/server/auth.ts`) pins `better-auth@^1.6.27`.
1.7 restructures how the `account` table identifies a linked provider
account, which touches our Google/Microsoft/LinkedIn social sign-in and
every call site that reads `account.providerId`. This PRD scopes the parts
of the 1.7 upgrade guide (https://better-auth.com/docs/guides/1-7-upgrade-guide)
that actually apply to this codebase and settles the open questions found
while verifying the guide against the installed package's real types.

Everything else in the 1.7 changelog (MCP, SCIM, SSO/SAML, two-factor,
Stripe, `oidcProvider` → `oauthProvider`, captcha path matching, device
authorization) is **out of scope** — none of those plugins/features are used
here.

## Decisions

These were settled by discussion on 2026-08-20. Do not re-open them.

| Decision                                            | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Backfill mechanics**                              | Run the backfill script + schema push in one shot. No phased/zero-downtime rollout. Delete backfill script after Sven has confirmed.                                                                                                                                                                                                                                                                                                                                                       |
| **`drizzleAdapter` provider mismatch**              | Fix `provider: 'sqlite'` → `'pg'` in the same change. `@repo/database` has run on `drizzle-orm/node-postgres` all along ([`packages/database/src/db.ts`](../../packages/database/src/db.ts)); the `'sqlite'` value is a leftover from an earlier `sqlite.db` setup (still visible, commented out, in `.env`). Unrelated to 1.7 itself, but 1.7 adds provider-aware atomic adapter methods (`incrementOne`/`consumeOne`), so a wrong provider tag is worth fixing while we're in this file. |
| **Microsoft account identity mismatch** (see below) | Force re-link. Delete existing Microsoft `account` rows during the maintenance window rather than trying to migrate them. Users see Microsoft as "not connected" afterward and reconnect manually. No feature currently depends on a stored Microsoft access token (no `getAccessToken({ providerId: 'microsoft' })` call site exists today), so this has no functional impact beyond the UI state.                                                                                        |

## Why: the account identity restructuring

1.7's core breaking change is how `account` rows are identified. Today,
`packages/database/src/schema/account.schema.ts` keys accounts by
`providerId` + `accountId`. 1.7 adds a required `issuer` column and a unique
compound index on `(issuer, accountId)`, and drops `providerId` from every
account-selector API (`getAccessToken`, `refreshToken`, `accountInfo`,
`unlinkAccount`) in favor of `accountId` meaning the **local** `account.id`
row, not the provider-side subject.

Verified directly against `@better-auth/core@1.7.1` source
(`dist/social-providers/{google,microsoft-entra-id,linkedin}.mjs`), not just
the upgrade guide's prose, because the guide summary didn't surface the
Microsoft-specific issue below:

| Provider  | New `issuer`                                                                                               | New `accountId` (`accountSubject`) | Matches what's stored today?                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google    | `"https://accounts.google.com"` (static, declared via `accountIssuer`)                                     | `profile.sub`                      | Yes — old provider also stored `sub` as `accountId`                                                                                                    |
| LinkedIn  | `local:oauth:linkedin` (no `accountIssuer` declared, falls back to `createOAuthAccountIssuer('linkedin')`) | `profile.sub`                      | Yes — old provider also stored `sub` as `accountId`                                                                                                    |
| Microsoft | `profile.iss` (dynamic — varies per tenant, read from the ID token's own `iss` claim)                      | `profile.oid`                      | **No** — the pre-1.7 provider stored `profile.sub`, and on Microsoft's v2.0 endpoint `oid` (directory object ID) ≠ `sub` (per-app pairwise identifier) |

Because Microsoft's identity claim changed under us, a naive backfill that
just adds `issuer` to existing rows would produce a row that the _next_
sign-in can never match (`(iss, oid)` looked up, `(old_iss, sub)` stored),
silently orphaning the old row. Per the decision above, we're not trying to
reconcile this — we drop the rows and let affected users reconnect.

## Scope of changes

### 1. Schema — `packages/database/src/schema/account.schema.ts`

- Add `issuer: text('issuer').notNull()` (push as nullable first, backfill,
  then tighten to `NOT NULL`).
- Add a unique index on `(issuer, accountId)`.
- Keep `providerId` — it's still returned by `listAccounts()` and still used
  directly by `packages/database/src/repositories/account.repo.ts`
  (`getAccountByUserIdAndProvider`), which queries the DB directly rather
  than going through a better-auth account-selector endpoint, so it's
  unaffected by the selector API changes.

### 2. `packages/auth/src/server/auth.ts`

- `drizzleAdapter(db, { provider: 'sqlite', schema })` → `provider: 'pg'`.

### 3. Backfill script (one-off, not a checked-in SQL migration)

Run once, during the maintenance window, before tightening the schema:

- **Google rows**: `issuer = 'https://accounts.google.com'`, `accountId`
  unchanged.
- **LinkedIn rows**: `issuer = 'local:oauth:linkedin'`, `accountId`
  unchanged.
- **Microsoft rows**: deleted.

### 4. Server call sites — `providerId` → `accountId: account.id`

These call `auth.api.getAccessToken()` and pass `providerId`, which 1.7 no
longer accepts there. Each already resolves the account row first via
`getAccountByUserIdAndProvider`, so the fix is swapping which field of that
row gets passed through:

- `apps/api/src/services/email-provider.service.ts:92`
- `apps/api/src/services/social-post.service.ts:516`
- `apps/worker/src/mail/gmail-provider.ts:24`

### 5. Client — `apps/web/app/features/user/composables/useUserSocialAccounts.ts`

- `LinkedAccount` needs an `id` field (the local account row id) sourced
  from `listAccounts()`, which still separately returns `providerId` (so
  `UserSocialSettings.vue`'s `account.providerId === provider.id` matching
  is unaffected).
- `DisconnectAccountInput` drops `providerId`; `unlinkAccount()` now takes
  only `{ accountId: string }`, where `accountId` is that local row id, not
  the provider-side id currently exposed as `LinkedAccount.accountId`.
- `UserSocialSettings.vue`'s `handleDisconnect` updates its call signature
  to match.

### 6. `packages/auth/src/client/auth-client-vue.ts`

Bumping the package version alone (no other code changes) breaks
`check-types` here: a `hydrateSession` signature mismatch, because the
admin plugin's inferred session/user type no longer structurally satisfies
the hand-rolled `AuthClient` type this file uses to work around a known
upstream issue (portable `.d.ts` generation, see the comment in the file
and https://github.com/better-auth/better-auth/issues/6565). Needs its own
fix — likely adjusting the intersection type — scoped separately since it's
independent of the account-identity work above.

## Verification before implementing

`better-auth` was bumped to `^1.7.1` in `packages/auth/package.json` and
installed locally to verify all of the above against real `.d.ts`/`.mjs`
source rather than the upgrade guide's prose summary (`node_modules/.pnpm/
better-auth@1.7.1.../` and `@better-auth+core@1.7.1.../`). Confirmed no
import-path breakage: `better-auth/adapters/drizzle`, `better-auth/plugins`
(`admin`, `lastLoginMethod`, `testUtils`), `better-auth/client/plugins`, and
`better-auth/vue` all still resolve. Dev DB has exactly one linked account
per provider (google/linkedin/microsoft), enough to exercise the backfill
and reconnect flow locally before touching production.

## Out of scope

- MCP (`@better-auth/mcp` migration) — not used.
- SCIM, SSO/SAML — not used.
- Two-factor, magic link/OTP changes — not used.
- Stripe plugin org-scoped subscriptions — not used.
- `oidcProvider` → `oauthProvider` — not used.
- Captcha path matching — not used.
- `experimental: { joins: true }` → `advanced: { database: { joins: true } }`
  — currently commented out/disabled in `auth.ts`; no action unless someone
  wants to enable joins as a separate change.
- Proxy `trustedProxyHeaders` — `config.apiBaseUrl` is static, not derived
  from forwarded headers, so this doesn't apply today. Revisit if the app
  moves behind a dynamic-baseURL reverse proxy setup.
