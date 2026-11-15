# Passkeys: slices

Build plan for [prd.md](./prd.md) and [design.md](./design.md). Every slice follows AGENTS.md and
loads the clean-code skill (plus tdd for anything reached by `apps/api`). Nobody commits.

## Before dispatch (lead)

The lead lands the shared contracts so the slices compile against them from the start:

- `@better-auth/passkey` installed in `packages/auth`, pinned to the `better-auth` version.
- `packages/auth/src/client/passkeys.ts`: `passkeyNameSchema`, `PasskeyActions`; `passkeyClient()`
  and the hand-typed `passkey` / `signIn.passkey` on `AuthClient`. Exported from `@repo/auth/client`.
- `packages/queue`: `passkeyAddedEmailJobSchema` and `PASSKEY_ADDED_EMAIL_JOB`.
- Packages rebuilt (`pnpm --filter @repo/<pkg> build`).

#395 (template emails don't render) is a separate fix on its own branch, merged before US-1.4 can
be verified by hand.

## Slices

| Slice         | Owns                                                                                                                                                                                                                                           | Delivers                                              | Runs                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| **A. Server** | `packages/auth/src/server/*`, `packages/database/src/schema/passkey.schema.ts`, `relations.ts`, migration, `packages/testing/src/auth/software-authenticator.ts`, `apps/api/test/auth/passkeys.test.ts`                                        | US-1.3, 1.4 (enqueue), 1.5, 2.2, 2.3, 2.4, 3.1 to 3.3 | `pnpm --filter @repo/api test`, `pnpm check-types`    |
| **B. Mail**   | `packages/mail/src/templates/passkey-added.vue`, `apps/worker/src/processors/email.processor.ts`, worker test                                                                                                                                  | US-1.4 (send)                                         | `pnpm test:worker`, `pnpm check-types`                |
| **C. Web**    | `apps/web/app/composables/useSignInRedirect.ts`, `pages/auth/login.vue`, `components/auth/AuthPasskeySignInButton.vue`, `features/sign-in/**`, `pages/settings/sign-in/**`, `useSettingsNavItems.ts`, locales, `apps/web/e2e/passkeys.spec.ts` | US-1.1, 1.2, 2.1, 2.5, 3.4                            | `pnpm test:e2e` (needs A on disk), `pnpm check-types` |

A, B and C run in parallel. C's e2e run waits until A reports done.

## Contracts

- `passkeyAddedEmailJobSchema`: `{ email, userName, passkeyName, settingsUrl }`. A enqueues, B consumes.
- `AuthClient.passkey`: `addPasskey`, `listUserPasskeys`, `updatePasskey`, `deletePasskey`;
  `AuthClient.signIn.passkey`. C calls, A's server serves.
- Error code `email_not_allowed` on rejected sign-in, same as the OAuth path. C maps it to the
  existing `auth.login.emailNotAllowedError` text.

## Known traps (already verified)

- `hooks.before` / `hooks.after` accept exactly one middleware each (better-auth 1.7.20 core types).
- Route paths: `/passkey/generate-register-options`, `/passkey/verify-registration`,
  `/passkey/verify-authentication`, `/passkey/update-passkey`, `/passkey/delete-passkey`,
  `/passkey/list-user-passkeys`. The name on add is in the `verify-registration` body.
- `lastLoginMethod` already maps `/passkey/verify-authentication` to `passkey`.
- `apps/api/test/organization/invitations.test.ts` overrides `config.allowedLoginEmails` at runtime.
  With the session-creation check, sessions seeded while an allowlist is active must use an allowed
  email. Keep that suite green.
- e2e shares one seeded session (`auth.setup.ts`). The passkey test seeds its own user and uses
  `context.clearCookies()`, never sign-out.
- `@simplewebauthn/server/helpers` exports `isoCBOR`, `isoBase64URL`, `cose`.

## Lead's integration pass

Run all touched suites and `pnpm check-types` once more, `pnpm format`, `pnpm lint`. Then docs:
`getting-started/sign-in.mdx`, notes in `self-hosting/configuration.mdx` and
`workspaces/organizations.mdx`, `specs/overview.md`, `pnpm specs:index`.
