# Integrations: connections separate from sign-in (PRD)

> **Status: decided** (2026-10-29). Issue #224, closes #152, supersedes #153.

Features use the sign-in account's tokens today. A user who links one provider twice can sync the
wrong mailbox or post as the wrong profile, and sign-in asks for feature permissions up front. This
PRD gives features their own connections. Sign-in only signs in. Design: [design.md](./design.md).

## Problem

- Features pick a token by user and provider without order. With two linked Google accounts, mail
  sync can use either (#152).
- Signing in with LinkedIn grants posting rights before the user ever posts (#153).
- Nothing can hold a shared account such as a team inbox (#190).

## Goals

- Every feature uses exactly one known connection. No feature reads sign-in tokens.
- Users grant feature permissions when they connect a feature, not at sign-in.
- Users connect their own accounts. Organization policy follows in phase 2.
- **Success signal:** no code path resolves a token by user and provider in the sign-in accounts.

## Non-goals

- New integrations beyond mail and LinkedIn posting.
- Organization policy (allowed integrations, default suite, defaults for new integrations, admin
  consent docs): phase 2, own PRD.
- Shared workspace connections and the team inbox: phase 3, own PRD (#190).
- Integration actions as agent tools and in workflows: phase 4, own PRD. design.md fixes the rule
  they follow.
- Organization-wide shared connections (#186).

## User stories

Roles: user (any signed-in user).

### US-1 Connect my own account (P1)

As a user, I want to connect my own Google, Microsoft or LinkedIn account for an integration, so
that RAGNA Studio acts with exactly my access and nothing more.

- **US-1.1** Given a user without a connection, when they connect an integration, then the
  provider asks only for that integration's permissions and the connection appears in their list.
- **US-1.2** Given a user with a Google connection for mail, when they connect another Google
  integration, then the provider asks for the added permissions and they still have one Google
  connection.
- **US-1.3** Given a user who signs in as anna@example.com, when they connect a Google or Microsoft
  account with another email, then it is refused with "Connect the account you sign in with".
- **US-1.4** Given a user whose LinkedIn email differs from their login email, when they connect
  LinkedIn, then the connection succeeds.
- **US-1.5** Rule: no API response contains an access or refresh token.

### US-2 Mailbox uses its own connection (P1)

As a user with a connected mailbox, I want sync and drafts to use only the account I connected for
mail, so that no other account of mine is read or written.

- **US-2.1** Given a user with a connected mailbox, when mail syncs, then only that mailbox's
  messages appear.
- **US-2.2** Given a mailbox whose connection the provider rejects, when sync runs, then sync stops
  for it and the user sees "Reconnect your mailbox".
- **US-2.3** Given a user who signs in with Google or Microsoft, when they sign in, then the
  provider asks for no mail permission.
- **US-2.4** Given an instance upgraded from a release where the mailbox used the sign-in account,
  when the user opens email, then they are asked to connect their mailbox again.

### US-3 Publish with my LinkedIn connection (P1)

As a user, I want to publish with the LinkedIn account I connected for posting, so that signing in
with LinkedIn never grants posting rights.

- **US-3.1** Given a user without a LinkedIn connection, when they publish, then they are asked to
  connect LinkedIn and the post stays a draft.
- **US-3.2** Given a user with a LinkedIn connection, when they publish, then the post appears on
  that profile and the post history shows the account used.
- **US-3.3** Given a user who signs in with LinkedIn, when they sign in, then LinkedIn asks for no
  posting permission.

### US-4 Manage my connections (P1)

As a user, I want to see my connections and reconnect or remove them, so that I stay in control of
what RAGNA Studio may access.

- **US-4.1** Given a user with connections, when they open their connections, then each shows the
  provider, account email, the integrations using it and its status.
- **US-4.2** Given a Google connection used by the mailbox, when the user removes it, then they are
  warned that the mailbox and its synced mail go too, and afterwards RAGNA Studio no longer appears
  under third-party access in their Google account.
- **US-4.3** Given a Microsoft connection, when the user removes it, then they are told where to
  remove the access in their Microsoft account.
- **US-4.4** Given a connection the provider rejects, when RAGNA Studio next uses it, then the user
  gets one notification and the connection offers "Reconnect".
- **US-4.5** Given a user who is removed from their organization, when the removal completes, then
  their connections are revoked and gone.

### US-5 Sign-in accounts carry my email (P1)

As a user, I want only accounts with my login email to be linkable for sign-in, so that every
sign-in account clearly belongs to me.

- **US-5.1** Given a signed-in user, when they link a sign-in account with another email, then the
  link is refused.
- **US-5.2** Given a user with a Microsoft sign-in account, when they link a second Microsoft
  account with the same email, then the link is refused.

## Testing

| Criterion                      | Level  | Folder                        |
| ------------------------------ | ------ | ----------------------------- |
| US-1.1 to US-1.5               | API    | `apps/api/test/integration/`  |
| US-2.1, US-2.2                 | worker | `apps/worker/test/email/`     |
| US-2.3, US-3.3, US-5.1, US-5.2 | API    | `apps/api/test/auth/`         |
| US-2.4                         | API    | `apps/api/test/email/`        |
| US-3.1, US-3.2                 | API    | `apps/api/test/social-post/`  |
| US-4.1 to US-4.4               | API    | `apps/api/test/integration/`  |
| US-4.5                         | API    | `apps/api/test/organization/` |

## Standards checklist

- **Deletion:** hard delete. Removing a connection revokes it at the provider where possible and
  deletes it. The mailbox goes with its connection, as on disconnect today.
- **Retention:** none. No logs or derived data are stored.
- **Erasure:** user and organization purge delete the connections and revoke them first.
- **Docs:** `integrations/email.mdx`, `integrations/social-posts.mdx`, new
  `integrations/connections.mdx`,
  `self-hosting/optional-providers.mdx`, `reference/environment-variables.mdx`.

## Decisions

**Sign-in and feature credentials are separate.** Sign-in accounts must carry the login email,
one per provider. Features get their own connections. The interim fix lost: pinning each mailbox
to one sign-in account would have kept feature permissions on sign-in and left LinkedIn open.

**Users hold tokens, organizations hold policy.** Providers enforce rights per token, so a token
held by the organization would give every user the admin's access. Shared accounts get workspace
connections (phase 3). Lost: organization admins connecting accounts for everyone.

**One connection per external account.** Permissions accumulate on it, because providers keep one
grant per app and account. Revoking one of several rows would silently revoke the others. Cost:
removing one integration doesn't narrow the granted permissions. Lost: one connection per
integration.

**A user's Google or Microsoft connection must carry their login email, strictly.** The address
the provider reports must equal the login email, also where Microsoft knows several addresses. It
keeps personal
connections personal, so a team inbox can't end up tied to one person who later leaves. LinkedIn
is exempt, since posting profiles often use another email. Lost: any account for any user.
