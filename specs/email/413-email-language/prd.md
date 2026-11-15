# Transactional emails: send them in the user's language (PRD)

> **Status: proposed** (2026-11-15). Issue #413, part of Epic #412.

RAGNA Studio sends every transactional email in English: welcome, organization invitation and
passkey added. The app itself defaults to German. This PRD stores the user's language on the
account and sends each email in it.

The language today lives only in the browser, as the Nuxt i18n cookie on the app host. The API and
the worker can't see it. Settings > Language only switches the interface.

## Problem

- `users` has no language column. The worker has nothing to choose a language from.
- Templates hard-code English text. Subjects are hard-coded in the worker, and the welcome subject
  still says "SaaS App".
- An invitee has no account yet, so their language is unknown when the invitation is sent.

## Goals

- Every transactional email arrives in the recipient's language, English or German.
- The language a user picks in settings follows their account to every device.
- **Success signal:** a German user's welcome, invitation and passkey emails are German, subject
  included.

## Non-goals

- The brand v2 email design. That is #414, blocked by its design handoff. This PRD moves every
  email onto one shared layout so #414 restyles a single file.
- Languages beyond English and German.
- A language picker in the invite dialog (decided against, see Decisions).

## User stories

Roles: user, org owner or admin (inviter), invitee (a person without an account yet).

### US-1 The language follows the account (P1)

As a user, I want the language I choose in settings to be stored on my account, so that the app
and my emails use it on every device.

- **US-1.1** Given a user, when they choose German in settings, then their profile returns German
  as their language.
- **US-1.2** Given a user, when they send a language other than English or German, then the request
  is rejected with `400` and their language stays unchanged.
- **US-1.3** Given a user whose account language is German, when they open the app on a device that
  shows English, then the app switches to German.
- **US-1.4** Given an existing user with no stored language, when they open the app, then the
  language the app shows is stored on their account.

### US-2 First sign-in picks the language (P1)

As a new user, I want my account to start in the language I signed up in, so that my welcome email
is already in my language.

- **US-2.1** Given the login page in German, when a new user signs up with Google, Microsoft or
  LinkedIn, then their account language is German.
- **US-2.2** Given a sign-up that sends no app language and a browser that prefers English, when
  the account is created, then its language is English.
- **US-2.3** Given a sign-up with neither an app language nor a supported browser language, when
  the account is created, then its language is German.
- **US-2.4** Given an existing user, when they sign in from a page in another language, then their
  stored language does not change.

### US-3 Emails in the recipient's language (P1)

As a user, I want every email from RAGNA Studio in my language, so that I understand it at once.

- **US-3.1** Given a new user with German as their language, when their account is created, then
  the welcome email, subject included, is German.
- **US-3.2** Given an inviter with English as their language, when they invite a person, then the
  invitation email is English.
- **US-3.3** Given a user with German as their language, when they add a passkey, then the passkey
  added email is German.
- **US-3.4** Given an account with no stored language, when an email is sent to it, then the email
  is German.
- **US-3.5** Rule: every email exists in English and German. A missing translation fails the build.

## Testing

| Criterion | Level                | Folder                                                   |
| --------- | -------------------- | -------------------------------------------------------- |
| US-1.1    | API                  | `apps/api/test/user/`                                    |
| US-1.2    | API                  | `apps/api/test/user/`                                    |
| US-1.3    | e2e (Playwright)     | `apps/web/e2e/`                                          |
| US-1.4    | e2e (Playwright)     | `apps/web/e2e/`                                          |
| US-2.1    | API                  | `apps/api/test/auth/`                                    |
| US-2.2    | API                  | `apps/api/test/auth/`                                    |
| US-2.3    | API                  | `apps/api/test/auth/`                                    |
| US-2.4    | API                  | `apps/api/test/auth/`                                    |
| US-3.1    | API + worker         | `apps/api/test/organization/`, `apps/worker/test/email/` |
| US-3.2    | API + worker         | `apps/api/test/organization/`, `apps/worker/test/email/` |
| US-3.3    | API + worker         | `apps/api/test/auth/`, `apps/worker/test/email/`         |
| US-3.4    | worker               | `apps/worker/test/email/`                                |
| US-3.5    | type-check + package | `packages/mail/test/`                                    |

API tests check the queued job carries the right language. Worker and `@repo/mail` tests check the
rendered subject and body in each language.

## Standards checklist

- **Deletion:** n/a. A new column on `users`, removed with the user.
- **Retention:** n/a. Nothing expires.
- **Erasure:** the language is a user preference on `users`. User purge already removes the row.
- **Docs:** `apps/docs` getting-started/dashboard-and-navigation, the Language row: it now also sets
  the email language.

## Decisions

**Invitations use the inviter's language.** The invitee has no account, so nothing is known about
them. An organization usually shares a language, so the inviter's is the best guess. It needs no
UI and no new invitation field. Once the invitee signs up, their own language applies. Lost: a
language picker in the invite dialog (extra UI and a field better-auth must store), and one email in
both languages (long, and every template doubles).

**One shared layout, text in typed TypeScript.** Every email renders through one
`transactional.vue`. Each email is a typed function per language that returns its subject and
content. A shared layout component can't work: Maizzle's auto-import skips files under
`node_modules`, which is where deployed images load templates from, and Maizzle doesn't export its
components for an explicit import (spike, 2026-11-15). Lost: one `.vue` file per email with the
layout copied into each, which #414 would have to restyle one by one.

**The login page sends its language with the sign-in.** It is what the user saw and maybe chose.
`Accept-Language` is only the fallback, then German, the app default. Lost: `Accept-Language` alone,
which ignores a language picked on the login page.

## Open questions

None.

## Design

See [design.md](./design.md) and [slices.md](./slices.md).
