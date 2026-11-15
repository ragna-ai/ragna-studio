# Passkeys: design

Design for [prd.md](./prd.md), issue #399. Build plan in [slices.md](./slices.md).

## Dependency

`@better-auth/passkey` in `packages/auth`, pinned to the installed `better-auth` version (its peer
range follows better-auth patch by patch). `@simplewebauthn/server` as a dependency of
`@repo/testing` only, for the CBOR and COSE helpers of the test authenticator.

| Package                   | License | Last release        | Weekly downloads | Transitive deps                                 | Verdict                                                  |
| ------------------------- | ------- | ------------------- | ---------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `@better-auth/passkey`    | MIT     | 2026-11-14          | 3.6 M            | SimpleWebAuthn server + browser, zod            | adopt                                                    |
| `@simplewebauthn/server`  | MIT     | 13.x (plugin range) | 10.9 M           | ~10 small ASN.1/CBOR packages, no native builds | via plugin; direct in `@repo/testing`                    |
| Own WebAuthn verification | n/a     | n/a                 | n/a              | n/a                                             | rejected: attestation and COSE parsing are security code |

**better-auth 1.8.** Building on 1.7.20 adds no upgrade work. The 1.8.0-beta.9 plugin has the same
schema, options and client API. Its only change is origin handling for wildcard `allowedHosts`,
which we don't use. 1.8's "user verification also on sign-in" is already in 1.7.20, and its
"session still active in the store" rule doesn't affect us (database sessions, no cookie cache).

## Plugin options

`passkey({ rpID, rpName: 'RAGNA Studio', origin, authenticatorSelection })`, with `rpID` and
`origin` derived from `config.appUrl`.

- `residentKey: 'required'`: the login page has no username field, so only discoverable passkeys
  can sign in.
- `userVerification: 'required'`: a passkey replaces the provider sign-in, so it must prove the
  person (fingerprint, face, PIN), not only the device.
- Registration keeps the default `requireSession: true`. It also requires a fresh session
  (better-auth `freshAge`, default 1 day). We keep the default: it is global.
- The challenge cookie is set by the API host and needs the existing cross-subdomain cookie domain.
  Verify in a production-like setup before merge.

## Code structure

Functions, no classes, like `organization-invitations.ts`. better-auth calls config and hooks with a
context; nothing holds state between calls.

| File                                                          | Holds                                                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `packages/auth/src/server/auth.ts`                            | Wiring only: `passkey(passkeyOptions)`, `hooks: { before, after }`, the session hook.                                   |
| `packages/auth/src/server/passkeys.ts`                        | `passkeyOptions`, the name-limit handler, `enqueuePasskeyAddedEmail`.                                                   |
| `packages/auth/src/server/login-allowlist.ts`                 | `isLoginEmailAllowed(email)`, used by `validateUserInfo`, `validateInvitation`, session hook.                           |
| `packages/auth/src/server/auth-hooks.ts`                      | `beforeHooks` and `afterHooks`: one middleware each, dispatching by path (see below).                                   |
| `packages/auth/src/client/passkeys.ts`                        | `passkeyNameSchema` (1 to 64 chars), `PasskeyActions` type. Client-safe, used by server + web.                          |
| `packages/database/src/schema/passkey.schema.ts`              | `passkeys` table, `user_id` FK `on delete cascade`, unique `credential_id`, in `relations.ts`, migration `db:generate`. |
| `packages/queue/src/dtos/email-job.dto.ts`                    | `passkeyAddedEmailJobSchema`, `PASSKEY_ADDED_EMAIL_JOB`.                                                                |
| `packages/mail/src/templates/passkey-added.vue`               | The mail: passkey name, date, link to the passkey settings.                                                             |
| `apps/worker/src/processors/email.processor.ts`               | One new `case`.                                                                                                         |
| `packages/testing/src/auth/software-authenticator.ts`         | `SoftwareAuthenticator` (see Tests).                                                                                    |
| `apps/web/app/composables/useSignInRedirect.ts`               | The post-sign-in target (home or MCP authorize resume), moved out of `login.vue`.                                       |
| `apps/web/app/features/sign-in/composables/usePasskeysApi.ts` | vue-query over `authClient.passkey.*`, with `unwrapAuthResult`.                                                         |
| `apps/web/app/features/sign-in/components/PasskeysCard.vue`   | List, add, rename (dialog), delete. Page `settings/sign-in/passkeys` in the **Sign-in** settings group.                 |
| `apps/web/app/components/auth/AuthPasskeySignInButton.vue`    | Login button; hidden without `'PublicKeyCredential' in window`.                                                         |

**Hooks by path.** better-auth takes exactly one `hooks.before` and one `hooks.after` middleware.
`auth-hooks.ts` holds a typed map from path to handler and one middleware that looks up
`ctx.path`. Handlers don't check the path themselves.

- before: `/organization/invite-member` → `rejectInvitingRemovedMember` (path check removed),
  `/passkey/verify-registration` and `/passkey/update-passkey` → name limit.
- after: `/passkey/verify-registration` → `enqueuePasskeyAddedEmail` when the route succeeded.

The name handler parses the body with `passkeyNameSchema` via `safeParse` (no casts) and throws
`APIError('BAD_REQUEST')`. Enqueue failures are logged, never thrown.

**Allowlist on session creation.** `databaseHooks.session.create.before` becomes a named function:
load the user with `getUserById`, reject with `APIError('FORBIDDEN', { code: 'email_not_allowed' })`
when `isLoginEmailAllowed` fails, then set `activeOrganizationId` as today. `validateUserInfo`
stays for OAuth, because it turns the rejection into a readable redirect.

**Client.** `passkeyClient()` joins `createAppAuthClient`. `AuthClient` gets hand-typed
`passkey: PasskeyActions` and `signIn.passkey`, like `OrganizationActions` (the plugin type isn't
portable, see the comment in `auth-client-vue.ts`).

## Tests

- **`SoftwareAuthenticator`** (`@repo/testing`). The one class in this feature: it keeps a key pair,
  credential id and sign counter across registration and sign-in. Created by
  `createSoftwareAuthenticator({ origin, rpID })`. Methods build the registration response
  (`none` attestation, ES256) and an assertion with user verification for a given challenge.
  Uses `isoCBOR`, `isoBase64URL` and `cose` from `@simplewebauthn/server/helpers` and WebCrypto.
- **API** (`apps/api/test/auth/passkeys.test.ts`): real requests through `app.request()`. Strict
  response schemas. The mail queue is mocked at the package boundary as in existing tests.
- **Worker:** the new job in the email processor test.
- **e2e:** a fixture adds a CDP virtual authenticator (`ctap2`, `internal`, resident key, user
  verified). The test uses its own seeded user and clears cookies instead of signing out.

## Extension points

- **No variant seam.** There is one passkey implementation. The organization setting (#400) is a
  policy check in the session hook and the registration before-hook, not a second variant.
- **Next hook on an auth route:** one entry in the path map in `auth-hooks.ts`.
- **Faked in tests:** the authenticator (software, API level; virtual, e2e) and the mail queue.
  Nothing in our own code is mocked.
- **Not abstracted:** no wrapper around the passkey client methods beyond `usePasskeysApi`; no
  repository for the `passkeys` table (the plugin owns all reads and writes).
