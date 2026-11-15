# Passkeys: sign in without an OAuth round trip (PRD)

> **Status: decided** (2026-11-15). Issue #399.

Users can only sign in through Google, Microsoft or LinkedIn today. This PRD adds passkeys as a
second way in for users who already have an account. A user adds a passkey once, then signs in with
their device's fingerprint, face or PIN. OAuth stays as it is, and it is also the way back in when a
device is lost.

## Problem

- Every sign-in goes through a provider's consent and account picker. With several Google
  accounts in one browser, users often pick the wrong one.
- Some users want a sign-in that doesn't depend on a provider session.
- better-auth ships a passkey plugin, so the WebAuthn part is not ours to build.

## Goals

- A user can add, rename and delete passkeys, and sign in with one.
- Passkey sign-in follows the same rules as OAuth sign-in: bans and the email allowlist apply.
- **Success signal:** passkey sign-ins show up as `passkey` in the last login method.

## Non-goals

- **Passkey-only sign-up.** A new user still signs up through OAuth. Proving email ownership
  without a provider needs verification mail and recovery, the same open questions that deferred
  password login (`specs/auth/password-login-prd.md`).
- **Passkeys as a second factor.** Providers already run their own MFA.
- **Autofill sign-in.** The login page has no username field to attach browser autofill to.
- **Organization setting to turn off passkeys.** With passkeys, turning off a user at their
  provider no longer blocks sign-in. Removal from the organization or the allowlist still does.
  The setting is #400.
- **Ending other sessions.** Deleting a lost passkey doesn't end the sessions it created. A
  general "sign out all other sessions" is #401.

## User stories

Roles: user.

### US-1 Add a passkey (P1)

As a user, I want to add a passkey to my account, so that I can sign in without going through a
provider.

- **US-1.1** Given a signed-in user in their profile settings, when they add a passkey and confirm
  on their device, then the passkey appears in their list with its name and creation date.
- **US-1.2** Given a signed-in user adding a passkey, when they cancel the device prompt, then no
  passkey is added and they see that adding was cancelled.
- **US-1.3** Given no session, when a client asks to register a passkey, then the API returns `401`.
- **US-1.4** Given a signed-in user, when a passkey is added to their account, then they receive an
  email naming the passkey and telling them how to remove it.
- **US-1.5** Rule: a passkey name is 1 to 64 characters, when adding and when renaming. A longer
  name is rejected with `400`.

### US-2 Sign in with a passkey (P1)

As a user, I want to sign in with a passkey, so that sign-in takes one step on my device.

- **US-2.1** Given a user with a passkey on the login page, when they sign in with it, then they
  land on the home page signed in.
- **US-2.2** Given a pending MCP authorize request, when the user signs in with a passkey, then the
  authorize request resumes.
- **US-2.3** Given a banned user with a passkey, when they sign in with it, then sign-in is
  rejected and they see the banned message.
- **US-2.4** Given an email allowlist that no longer contains the user's email, when they sign in
  with a passkey, then sign-in is rejected and they see the "email not allowed" message.
- **US-2.5** Given a device with no passkey for this site, when the user cancels the device prompt,
  then they stay on the login page and see an error.

### US-3 Manage passkeys (P1)

As a user, I want to rename and delete my passkeys, so that I can tell my devices apart and remove
one I lost.

- **US-3.1** Given a user with a passkey, when they rename it, then the list shows the new name.
- **US-3.2** Given a user with a passkey, when they delete it, then it leaves the list and signing
  in with it is rejected.
- **US-3.3** Given another user's passkey, when a user tries to rename or delete it, then the
  request is rejected and the passkey is unchanged.
- **US-3.4** Given a user without passkeys, when they open their profile settings, then they see an
  empty state that offers to add one.

## Testing

| Criterion | Level            | Folder                                     |
| --------- | ---------------- | ------------------------------------------ |
| US-1.1    | e2e (Playwright) | `apps/web/e2e/`                            |
| US-1.2    | visual review    | n/a                                        |
| US-1.3    | API              | `apps/api/test/auth/`                      |
| US-1.4    | API + worker     | `apps/api/test/auth/`, `apps/worker/test/` |
| US-1.5    | API              | `apps/api/test/auth/`                      |
| US-2.1    | e2e (Playwright) | `apps/web/e2e/`                            |
| US-2.2    | API              | `apps/api/test/auth/`                      |
| US-2.3    | API              | `apps/api/test/auth/`                      |
| US-2.4    | API              | `apps/api/test/auth/`                      |
| US-2.5    | visual review    | n/a                                        |
| US-3.1    | API              | `apps/api/test/auth/`                      |
| US-3.2    | API              | `apps/api/test/auth/`                      |
| US-3.3    | API              | `apps/api/test/auth/`                      |
| US-3.4    | visual review    | n/a                                        |

API tests sign in with a software authenticator (see [design.md](./design.md)). e2e uses Chromium's virtual
authenticator, so the browser ceremony runs for real.

## Standards checklist

- **Deletion:** hard delete. A deleted passkey is gone; nothing to stop.
- **Retention:** nothing expires. Challenges live in a short-lived signed cookie, not in the database.
- **Erasure:** passkey rows (public key, name, device type) are personal data. They go with the
  user through the foreign-key cascade on user purge.
- **Docs:** no sign-in page exists yet. New `apps/docs` page `getting-started/sign-in.mdx`, and a
  note in `self-hosting/configuration.mdx` that the app URL's host binds passkeys. A note in
  `workspaces/organizations.mdx`: turning off a user at their provider doesn't stop passkey
  sign-in, so offboarding means removing them from the organization.

## Decisions

**Passkeys are bound to the app hostname.** The relying party ID is the host of `APP_URL`
(`app.ragna.io` in production), not the parent domain `ragna.io`. A passkey only works on the host
it was created for, so changing this later locks every user out of their passkeys. The app host is
where the sign-in runs and needs no new setting for self-hosters. The parent domain would let other
subdomains (website, docs) use the same passkeys, which no one needs.

**The allowlist is checked when a session is created.** Today it only runs on OAuth sign-in, which
passkeys bypass. Checking it at session creation covers every sign-in method, now and later. The
OAuth check stays, because it turns a rejection into a redirect with a readable error.

## Design

Schema, dependency choice, server and client changes: [design.md](./design.md).
