# Password login

Status: deferred (2026-10-07). Not requested by users yet, and it raises security, RBAC and account-linking questions. Login stays OAuth only.

## Why deferred

The trigger was the quickstart, not a user request. Designing it showed that password login can't stay small:

- Customers would want it on servers, which means multi-user sign-up, reset and verification by mail, and real rate limiting.
- "Who may add users" depends on RBAC, which doesn't exist yet.
- Mode switches or mixed OAuth and password setups hit the account-linking rules below.

Findings worth keeping for a later restart:

- **Account linking:** better-auth 1.7.7 only links an OAuth sign-in to an existing user when `accountLinking.requireLocalEmailVerified` (default `true`, not in the public docs) is met. Unverified password users can't be auto-linked. `linkSocial` while signed in still works.
- **Blocking OAuth login but keeping OAuth connect:** `/sign-in/social` and `/link-social` are separate endpoints. Their callback is shared.
- **`anonymous` plugin:** creates a new user on every sign-in and deletes it when the user later signs in for real. Not usable for a persistent local user.
- **Rate limiting:** only on when `NODE_ENV=production`. Without a client IP it falls back to one shared bucket per path. `ipAddressHeaders` is hardcoded to `cf-connecting-ip` today.

The design below is the state at the time of deferral.

## Problem

Sign-in is OAuth only: Google, Microsoft and LinkedIn (`packages/auth/src/server/auth.ts`).
Anyone who tries RAGNA Studio locally has to create an OAuth app first.
In the Google Cloud console that takes about 15 minutes. It is the biggest hurdle in the quickstart.

The planned `get.ragna.io` install script can generate secrets, set up storage and start the stack.
It can't create an OAuth app. Without another way to sign in, the one-liner still ends with
"now go to the Google console".

## Scope

Password login is for **one user on localhost**. The person who installs the app creates the only
password account, then uses the app alone.

For anything reachable by others (public server, private VPN, cloud), the recommended setup stays
OAuth plus `ALLOWED_LOGIN_EMAILS`. The self-hosting docs say so.

## Goals

- A local instance can be used without any OAuth app.
- The feature is off by default. Production on ragna.io doesn't change.
- An instance with the flag on can't be taken over through open sign-up.

## Non-goals

- **More than one password user.** No invites, no admin-created users, no allowlist path.
- **Two-factor auth, passkeys, magic links.**
- **Breached-password check.**
- **Rate limiting with Redis storage.** better-auth's default in-memory limiter is enough for one
  backend replica on localhost.

## Design

### Config

| Var                                 | Default | Meaning                                                              |
| ----------------------------------- | ------- | -------------------------------------------------------------------- |
| `AUTH_PASSWORD_ENABLED`             | `false` | Turns on email and password sign-in, plus sign-up for the first user |
| `NUXT_PUBLIC_AUTH_PASSWORD_ENABLED` | `false` | Same value, shows the form in the web app                            |

The pair follows the `MEDIA_URL` and `NUXT_PUBLIC_MEDIA_URL` pattern.

### better-auth

```ts
emailAndPassword: {
  enabled: config.authPasswordEnabled,
  requireEmailVerification: false,
},
```

- `requireEmailVerification` stays off. A local install has no SMTP, so a verification mail could never arrive.
- Minimum password length stays at better-auth's default of 8.
- Social providers stay as they are. Both methods can be on at the same time.

### Who may sign up

Password sign-up is allowed only while **no user exists**. The first person becomes the owner
(n8n's "owner setup"). After that, `/auth/sign-up/email` returns 403 for everyone.

- The check is a `hooks.before` on `/sign-up/email`. OAuth sign-ups keep today's behavior.
- The "no user exists" check runs in the same transaction as the insert. Two parallel sign-ups on an
  empty instance must not both become owner.
- The owner is created with `role = 'admin'`.
- `ALLOWED_LOGIN_EMAILS` still applies through the existing `validateUserInfo`. If it's set, the
  owner's email must be on it.

### Account linking

Checked against better-auth 1.7.7 (`better-auth/dist/oauth2/link-account.mjs`, `handleOAuthUserInfo`).

- **Implicit linking does not work for password users.** When someone signs in with Google using the
  owner's email, better-auth only links if `accountLinking.requireLocalEmailVerified` (default `true`)
  is met. The owner's `emailVerified` is `false`, because there is no verification mail. The Google
  sign-in fails with `account not linked`.
  - The public docs don't mention `requireLocalEmailVerified`. It is only visible in the code.
- **Explicit linking works.** The signed-in owner connects Google on the account page
  (`useUserSocialAccounts.ts`, `authClient.linkSocial`). That path passes `selectedUser` and skips the
  email checks.
- **We keep the default.** Turning off `requireLocalEmailVerified` would allow account pre-hijacking:
  someone registers a password account with another person's email, then keeps access after that
  person links Google.

### Web app

- `apps/web/app/pages/auth/login.vue` shows an email and password form above the social buttons when
  `NUXT_PUBLIC_AUTH_PASSWORD_ENABLED` is on. Only configured methods are shown.
- On an empty instance, the page shows the owner sign-up form instead. The web app needs an endpoint
  that says whether setup is still open.
- The MCP authorize resume (`client_id` and `sig` query params) must work for password sign-in too.

### Install script

The `get.ragna.io` script sets `AUTH_PASSWORD_ENABLED=true` and prints "open localhost:3000 and
create your account". After that, the only thing it asks for is an LLM key.

## Testing

TDD in `apps/api/test/auth/`:

- Flag off: sign-in and sign-up with email return 404.
- Flag on, empty instance: the first sign-up succeeds and gets a workspace.
- Flag on, one user exists: any further sign-up returns 403.
- Two parallel sign-ups on an empty instance: exactly one succeeds.
- Google sign-in with the owner's email fails without linking; `linkSocial` while signed in succeeds.

## Migration

No schema change. better-auth stores the password hash in the existing `account` table
(`providerId = 'credential'`). Existing OAuth users are not affected. ragna.io production keeps the
flag off.

## Open questions

| Question           | Notes                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Forgotten password | No mail on localhost, and no CLI script exists yet. Options: a new script in the backend image, or none in v1. |

## Decided

| Date       | Decision                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------- |
| 2026-10-07 | Feature behind a flag, off by default.                                                             |
| 2026-10-07 | Single owner on localhost only. Public or shared hosting uses OAuth plus allowlist.                |
| 2026-10-07 | Keep better-auth's account linking defaults. Linking for password users goes through `linkSocial`. |
| 2026-10-07 | Minimum password length 8 (better-auth default). No breached-password check.                       |
| 2026-10-07 | The owner gets `role = 'admin'`. Nothing reads the role yet; RBAC is planned.                      |
