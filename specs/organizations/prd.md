# Organizations v1: the org owns workspaces

**Status: implemented** (PR #94, 2026-10-09). v2 (members, invites, org settings UI) follows
right after and gets its own PRD.

## Summary

Add organizations with the better-auth `organization` plugin. Every user gets exactly one
organization at sign-up and is its `owner`. Workspaces move from the user to the organization.
Credits move from the user to the organization too.

v1 is plumbing only. Nothing changes for users: no org UI, no invites, one member per org. It
puts the data model in place so v2 can let the owner add people to their org.

```text
user
  membership (member row, role)
    organization          owns billing, members, policies, integrations
      workspaces          own agents, chats, documents, datasets, ...
        domain resources  keyed by workspace_id (unchanged)
```

## Problem

Today a workspace belongs to a user (`workspace.ownerId → users.id`), and credits belong to a
user (`credit_accounts.user_id`). Neither can be shared. v2 lets an owner bring other users
into their organization, where they work in the same workspaces and draw from one credit
balance. That needs an owner above the user before any member can join.

`specs/workspaces/workspaces.md` named the column `ownerId` as prep for a `workspace_users`
pivot. This PRD takes the organization route instead, and renames the column (see
[Decisions](#decisions), 4).

## Goals

- Organizations, memberships and invitations exist as better-auth plugin tables in our Drizzle
  schema.
- Every user, existing and new, owns exactly one organization.
- Every workspace belongs to an organization. Access is granted through membership.
- Credit accounts belong to organizations. Usage keeps recording which user ran it.
- The plugin's HTTP routes are safe to leave mounted, so v2 can use them directly.
- No visible change for users, and no breaking change for self-hosters (the migration converts
  existing data).

## Non-goals (v2 or later)

- Inviting users, email invites, the accept page, the `ALLOWED_LOGIN_EMAILS` interplay.
- Org settings UI (rename, members, roles).
- Owner account deletion with members in the org (confirm, wipe or unlink member accounts).
- An invited user who already owns an org (rare today, see [v2 topics](#v2-topics)).
- App-level RBAC for workspace resources (viewer, editor). In v1 every member may do
  everything in the org's workspaces. Roles only gate org administration.
- Per-workspace access inside an org (`workspace_members` or better-auth teams).
- Org-scoped shared resources (agent templates, media, integrations).
- Multi-org: a user owning more than one org is not planned.

## Decisions

| #   | Decision                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Organization as tenant.** The organization owns workspaces. Users reach workspaces through membership. The alternative (user-owned workspaces, org as billing umbrella) is under [Considered](#considered). |
| 2   | **better-auth `organization` plugin**, tables in our Drizzle schema. v2 uses its routes for invites and org updates.                                                                                          |
| 3   | **One org per user**, created at sign-up, the user is `owner`. Users can't create more.                                                                                                                       |
| 4   | **`workspace.owner_id` is replaced by `workspace.organization_id`**, not reused. Same migration cost, and TypeScript flags every call site.                                                                   |
| 5   | **All org members access all org workspaces.** `workspaceGuard` checks membership of `workspace.organization_id`.                                                                                             |
| 6   | **Members may do everything in org workspaces.** Org roles (`owner`, `admin`, `member`) only gate org administration.                                                                                         |
| 7   | **Plugin routes stay mounted, locked by config** (not `disabledPaths`). See [Plugin configuration](#1-plugin-configuration).                                                                                  |
| 8   | **`session.activeOrganizationId` is set at session creation** to the user's org. A convenience for better-auth routes and the client. Our API never uses it for authorization.                                |
| 9   | **`credit_accounts.user_id` is replaced by `credit_accounts.organization_id`.** Every account is an org account.                                                                                              |
| 10  | **Deleting a user deletes their org**, and with it the org's workspaces.                                                                                                                                      |
| 11  | **The org is invisible in v1.** No org routes on our API, no UI.                                                                                                                                              |
| 12  | **No unique index on `member.user_id`.** "Owns one org" is enforced by sign-up code and `allowUserToCreateOrganization: false`, so v2 can still let a user be a member elsewhere.                             |
| 13  | **No `workspace.created_by_user_id` in v1.** Nothing reads workspace authorship today. v2 adds it if the members UI needs it.                                                                                 |

## Design

### 1. Plugin configuration

`packages/auth/src/server/auth.ts`:

```ts
organization({
  allowUserToCreateOrganization: false,
  disableOrganizationDeletion: true,
  invitationLimit: 0,
});
```

What each option closes, verified against better-auth 1.7.7:

| Route                                          | Without config                                                                           | With config                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /auth/organization/create`               | Any user creates more orgs.                                                              | 403. Server calls with `body.userId` and no session are a "system action" and still pass (`crud-org.mjs`), so sign-up isn't blocked. |
| `POST /auth/organization/delete`               | The owner deletes the org. The FK cascade deletes every workspace and skips R2 cleanup.  | 404 `ORGANIZATION_DELETION_DISABLED`.                                                                                                |
| `POST /auth/organization/invite-member`        | Invitation rows get created. Nothing sends an email, but the rows can be accepted by id. | 403. The check is `pending >= invitationLimit`, so `0` blocks every invite. v2 raises it.                                            |
| `leave`, `remove-member`, `update-member-role` | The last owner could leave or be demoted.                                                | Built-in: the plugin rejects removing or demoting the only owner.                                                                    |
| `update`, `get-*`, `list*`, `set-active`       | Harmless in v1. v2 uses `update`.                                                        | Unchanged.                                                                                                                           |

`creatorRole` stays at its default, `owner`. Teams and dynamic access control stay off.

No `organizationClient()` on the web client in v1. It arrives with the v2 UI.

Not to be confused: `user.role = 'admin'` comes from the platform `admin()` plugin and means
"platform admin". `member.role` is the role inside an org.

### 2. Schema

New tables, defined in `packages/database/src/schema/organization.schema.ts` in the shape the
plugin expects. Plural table names, like `users` and `sessions`. Ids come from
`primaryIdColumn` (`generateId: false` stays).

**`organizations`** (model `organization`)

| Column       | Type      | Notes                                                        |
| ------------ | --------- | ------------------------------------------------------------ |
| `id`         | text      | `primaryIdColumn`                                            |
| `name`       | text      | not null. The user's name at creation.                       |
| `slug`       | text      | not null, unique. Required by the plugin. Set to the org id. |
| `logo`       | text      | nullable                                                     |
| `metadata`   | text      | nullable. Unused.                                            |
| `created_at` | timestamp | not null                                                     |

**`members`** (model `member`)

| Column            | Type      | Notes                                               |
| ----------------- | --------- | --------------------------------------------------- |
| `id`              | text      | `primaryIdColumn`                                   |
| `organization_id` | text      | not null, FK → `organizations.id`, cascade          |
| `user_id`         | text      | not null, FK → `users.id`, cascade                  |
| `role`            | text      | not null. Comma-separated if several (plugin rule). |
| `created_at`      | timestamp | not null                                            |

Unique `(organization_id, user_id)`. Index on `user_id` (the guard looks members up by user).

**`invitations`** (model `invitation`). Created now so v2 needs no schema change.

| Column            | Type      | Notes                                      |
| ----------------- | --------- | ------------------------------------------ |
| `id`              | text      | `primaryIdColumn`                          |
| `organization_id` | text      | not null, FK → `organizations.id`, cascade |
| `email`           | text      | not null                                   |
| `role`            | text      | nullable                                   |
| `status`          | text      | not null, default `pending`                |
| `expires_at`      | timestamp | not null                                   |
| `inviter_id`      | text      | not null, FK → `users.id`, cascade         |
| `created_at`      | timestamp | not null                                   |

**Changed tables**

- `sessions`: add `active_organization_id` (text, nullable, no FK, as the plugin defines it).
- `workspaces`: drop `owner_id`, add `organization_id` (not null, FK → `organizations.id`,
  cascade, indexed). The `workspace_ownerId_idx` index goes with the column.
- `credit_accounts`: drop `user_id`, add `organization_id` (not null, unique, FK →
  `organizations.id`, cascade).

All three new tables are registered in `relations.ts`: `organization` has many `members`,
`invitations`, `workspaces` and one `creditAccount`. `member` belongs to `organization` and
`user`. `workspace.owner` becomes `workspace.organization`.

### 3. Sign-up and session

`databaseHooks.user.create.after` today creates the "Personal" workspace. It becomes one
transaction in our repository layer:

1. Insert the organization (`name` = user name, `slug` = org id).
2. Insert the member row (`role = 'owner'`).
3. Insert the "Personal" workspace with `organization_id`.

Plain repository inserts, not `auth.api.createOrganization`: one transaction for all three
rows, and no call from inside `auth`'s own config back into `auth`. The plugin has no
create hooks registered in v1, so nothing is skipped.

`databaseHooks.session.create.before` looks up the user's membership and sets
`activeOrganizationId`. In the OAuth sign-up flow the user is created before the session, so
the org already exists. A test pins this ordering.

Only better-auth routes and the v2 client read `activeOrganizationId`. Our API never reads it:
the scope of a workspace request is the URL's `:workspaceId`, and authorization is the
membership check. This keeps the 2026-07-25 rule in `specs/api-standards/prd.md` ("the URL is
the sole scope carrier").

### 4. Access

`workspaceGuard` changes its single query from `ownerId = user.id` to a membership join:

```sql
SELECT w.* FROM workspaces w
JOIN members m ON m.organization_id = w.organization_id
WHERE w.id = $workspaceId AND m.user_id = $userId
```

Still one query per request. Repositories below the guard don't change: they keep filtering by
`workspace_id`.

`/workspace` (list, create) resolves the user's organization from their membership. In v1
that's exactly one row. v2 decides whether the active org selects it once users can be members
elsewhere.

### 5. Call sites of `ownerId`

The rename makes each of these a compile error. The intended replacement:

| Call site                                        | Today                                      | v1                                                                                                         |
| ------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `workspaceGuard.ts`                              | `getWorkspaceById({ id, ownerId })`        | Membership join (section 4)                                                                                |
| `workspace.repo.ts`                              | CRUD scoped by `ownerId`                   | Scoped by `organizationId`. A `getWorkspaceForMember` accessor for the guard.                              |
| `workspace.service.ts`                           | list, create, rename, delete by user       | Resolve the user's org, then scope by `organizationId`. "Can't delete your only workspace" counts per org. |
| `mcp-settings.service.ts:96`                     | `getWorkspaceById({ id, ownerId })`        | `getWorkspaceForMember`                                                                                    |
| `email.service.ts:1453`                          | User's workspaces for attachment access    | Workspaces of the user's org                                                                               |
| `task.repo.ts:473` (reminder cron)               | Recipient = `workspace.ownerId`            | Recipient = the org's owner(s). Same person in v1. v2 revisits (assignee, creator).                        |
| `credit.repo.ts:94`                              | `creditAccount.userId = workspace.ownerId` | `creditAccount.organizationId = workspace.organizationId`                                                  |
| `auth.ts:137` (sign-up)                          | `createWorkspace({ ownerId })`             | Section 3                                                                                                  |
| `relations.ts:786`                               | `workspace.owner`                          | `workspace.organization`                                                                                   |
| `packages/testing/src/auth/auth-seed.ts:65`      | Workspaces by owner                        | Workspaces of the seeded user's org                                                                        |
| `apps/web/app/features/workspace/types/index.ts` | `ownerId: string`                          | `organizationId: string`                                                                                   |

Not affected: `ownerId` in `packages/media` (`media-keys.ts`, `media.service.ts`). That is the
**media** owner (the workspace id) used for R2 key paths, not `workspace.ownerId`. R2 keys don't
change.

### 6. Credits

The billing entity becomes the organization, as `specs/credits/prd.md` anticipated.

- `resolveCreditSpendState({ workspaceId })` joins
  `workspace.organization_id → credit_accounts.organization_id`. Still one join.
- `getCreditSpendStateForUser` becomes `getCreditSpendStateForOrganization`. `/credit/balance`
  and `/credit/usage` resolve the user's org from their membership first.
- `getOrCreateCreditAccountByUserId` becomes `getOrCreateCreditAccountByOrganizationId`.
- `credits:grant` keeps taking a user email and resolves it to that user's org.
- The ledger is untouched: it references `credit_account_id`.
- `credit_usage_events.user_id` stays: "who ran it", for per-member usage in v2.

### 7. User deletion

`databaseHooks.user.delete.before` deletes the organizations the user owns. The FK cascade then
removes members, invitations, workspaces (with their resources) and the credit account.

This matches today's outcome, where workspaces cascade from `owner_id`. Today's gap also stays:
deleting a user doesn't remove their files from R2/S3, because nothing runs
`deleteWorkspaceMediaObjects` on that path. Fixing it belongs to the v2 account-deletion flow.

### 8. Migration

Three drizzle migrations in one release (see
[Generating the migration](#generating-the-migration)), applied by the `migrate` service. Plain
SQL with PG18's native `uuidv7()`, no script and no new dependencies. The 2026-10-08
`workspace_scoped_references` migration is the precedent for backfills in SQL.

1. Create `organizations`, `members`, `invitations`. Add `sessions.active_organization_id`.
2. For every user: insert an organization (`id = uuidv7()`, `name` = user name, `slug` = id) and
   an `owner` member row.
3. Add `workspaces.organization_id` (nullable), backfill from the owner's member row, set not
   null, add FK and index, drop `owner_id`.
4. Add `credit_accounts.organization_id` (nullable), backfill from the user's member row, set not
   null and unique, add FK, drop `user_id`.
5. Backfill `sessions.active_organization_id` for live sessions.

Steps 2 to 5 run in one `DO` block with row-count notices, like the precedent. Self-hosters get
the same migration with the next release.

**Runs once.** drizzle's `migrate()` records every applied migration in
`drizzle.__drizzle_migrations` and only runs folders missing from it. All pending migrations
and their journal rows commit in one transaction, so a failed backfill rolls back the schema
change too, and the next deploy retries. The advisory lock in `migrate.ts` stops two
containers from racing it. A separate backfill script isn't needed: past scripts existed
because they needed app code (e.g. re-embedding via the queue), and this one is pure SQL that
must run between adding and dropping columns.

**Deploy window, accepted.** The migration drops `workspaces.owner_id` and
`credit_accounts.user_id`. Until the old API container is replaced, its requests touching those
columns fail. That's a few seconds, and no real users are on the app yet, so one release beats
an expand/contract split over two releases.

#### Generating the migration

`drizzle-kit generate` diffs the TS schema against the last snapshot. When one table loses a
column and gains another in the same diff, it can't tell a rename from a drop plus an add, and
asks. Without a TTY, drizzle-kit 1.0 doesn't prompt: it exits with `missing_hints` and prints
the JSON answer for `--hints`. To keep generation free of such questions, no single diff both
removes and adds a column on the same table:

| Step        | Command                                                                           | Schema state in TS                                                                                                                                                                       | SQL written by                                |
| ----------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1. Expand   | `pnpm --filter @repo/database db:generate --name organizations_expand`            | New tables and `sessions.active_organization_id`. `organization_id` added as nullable (unique on `credit_accounts`). `owner_id` and `credit_accounts.user_id` unchanged, still not null. | drizzle-kit. Additions and alters only.       |
| 2. Backfill | `pnpm --filter @repo/database db:generate --custom --name organizations_backfill` | Unchanged                                                                                                                                                                                | Hand-written `DO` block (steps 2 to 5 above). |
| 3. Contract | `pnpm --filter @repo/database db:generate --name organizations_contract`          | `organization_id` not null. `owner_id` and `credit_accounts.user_id` removed.                                                                                                            | drizzle-kit. Drops and alters only.           |

All three ship together. The migrator applies pending migrations in one transaction, so the
result is as atomic as a single migration.

Rules:

- Run each generate with `--explain` first. If it reports `missing_hints`, stop and report. Never
  invent hints.
- Never edit a generated `migration.sql` or snapshot. Only the `--custom` file is hand-written.
- Never `db:push` against the dev database. `test:setup` pushes into a freshly recreated
  `studio_test`, which is fine.

**Verifying the backfill.** The API suite doesn't run migrations: `test:setup` pushes the schema.
So the backfill is checked once, by hand, and the result goes into the PR:

1. Create a scratch database `studio_migration_check` and apply `main`'s migrations with
   `db:migrate`.
2. Seed users, workspaces, credit accounts and sessions via SQL.
3. Apply the branch's migrations with `db:migrate`.
4. Assert: one org and one `owner` member per user, no workspace or credit account without an
   org, live sessions have `active_organization_id`, row counts of workspaces and credit
   accounts unchanged.

**Local dev databases** were built with `db:push`, which would hit the rename question and fail
on `NOT NULL` with existing rows. After merging, run `db:migrate`. A dev database that was never
baselined needs `db:baseline` first, run before pulling the new migrations. Or recreate it.

### 9. Tests

Test-driven, per `apps/api` rules. Covered at least:

- Sign-up creates org, owner membership and "Personal" workspace. A session created at sign-up
  has `activeOrganizationId` set.
- `workspaceGuard`: a member gets in; a user from another org gets 404.
- Workspace list, create, rename, delete scoped to the user's org. The last-workspace rule
  counts per org.
- Credits: spend resolves through the workspace's org; balance and usage routes resolve the
  user's org; the grant script lands on the org account.
- Plugin lock: `create` returns 403, `delete` returns 404, `invite-member` returns 403, the only
  owner can't leave.
- User deletion removes the org, its workspaces and its credit account.
- Migration: existing users, workspaces, credit accounts and sessions end up linked to one org
  per user.

## v2 topics

Recorded so v2 starts from them. v2 is specified in [v2-prd.md](./v2-prd.md): members, invites,
org settings, soft delete with a 30-day purge.

- Owner adds users: email invites (`sendInvitationEmail` via the mail queue), accept page,
  `invitationLimit` raised, `ALLOWED_LOGIN_EMAILS` interplay. Accepting needs a verified email,
  because `generateId: false` makes better-auth require one. Our OAuth providers supply it.
- Invited users: skip org creation at sign-up for an invited email, or let them keep their own
  org. Rare today.
- Org settings UI via `organizationClient()`: rename, members, roles.
- Owner deletes their account while the org has members: confirm and wipe, or unlink. Fix the
  R2 cleanup on that path.
- Leftover user-scoped filters must become workspace-scoped before a second member joins:
  chat rename (`chat.repo.ts:175`), dataset row append and reorder (`dataset.repo.ts:435`,
  `:505`), default agent per user (`agent.repo.ts:47`).
- Resource `user_id` columns cascade on user delete (agents, chats, workflows, ...). With
  members, removing a user would delete their work from shared workspaces. Switch to
  `set null` authorship.
- Task reminder recipient (owner today). With several owners, the cron gets one row per owner
  for the same task and calls `markTaskReminderSent` per row.
- `getOrganizationIdByUserId` returns the oldest membership. Workspace list/create and
  `/credit/balance` use it, so a member of someone else's org sees their own org there. v2
  decides how the org is chosen (`activeOrganizationId`, or one membership per user).
- Owner checks compare `member.role = 'owner'`, but better-auth stores several roles
  comma-separated (`owner,admin`). Fine while every member has one role.
- Caching the guard's membership check, as the resource-guard PRD suggested.

## Considered

**User-owned workspaces, org as billing umbrella.** Guard and repositories unchanged,
workspaces private. Rejected: v2 wants members working in the same workspaces. Switching to
org-owned workspaces later means re-parenting every workspace. Private workspaces inside an org
remain possible later via per-workspace access.

**Reusing `owner_id` for the org id.** Works only because every workspace ends up org-owned.
Rejected: the value changes meaning while the type stays `string`, so the call sites in
section 5 would compile and break at runtime. The rename costs the same migration.

**Disabling plugin routes with `disabledPaths`.** Strict, but it matches exact paths, so every
route needs listing, and v2 would remove the list again. Config covers the same risks.

**Session-free active org.** First proposed, because a session value fights the URL when a user
switches scope. With one org per user there's nothing to switch, so the session value is a free
convenience as long as it never authorizes anything.

**Own tables instead of the plugin.** No unused columns, but v2 would rebuild member management,
role checks and last-owner protection that the plugin already has.

**Credit account with both `user_id` and `organization_id` plus a CHECK** (the credits PRD
sketch). Rejected: every user owns an org, so the personal-account path would never be used.

## Docs to update when built

- `specs/workspaces/workspaces.md`: the "Owner column" row and "Shared workspaces" note point
  here.
- `specs/api-standards/prd.md`: "Access control" describes the membership check.
- `specs/credits/prd.md`: account resolution and "Billing entity resolution".
- `specs/overview.md`: add organizations.

## Rollout

One PR, one agent per slice, one commit per slice. TDD in every slice. v2 builds on top.

Between migration 1 (expand) and migration 3 (contract), both the old and the new columns exist,
so the code compiles after every slice. That is what lets S2 and S3 run in parallel. The old
columns stay not null until S4 (a nullable `ownerId` would change its TS type and break
`check-types` in S1), so every place that creates rows writes both columns until then.

```text
S1 Foundation ──┬── S2 Access ───┬── S4 Contract
                └── S3 Credits ──┘
```

### S1 Foundation

- Org tables in plugin shape (`organizations`, `members`, `invitations`),
  `sessions.active_organization_id`, registered in `relations.ts`.
- `organization()` registered with the lock config (section 1).
- Migration 1 (expand) and migration 2 (backfill), plus the backfill check from
  [Generating the migration](#generating-the-migration).
- Sign-up writes org, owner member and "Personal" workspace in one transaction. It writes both
  `owner_id` and `organization_id` until S4.
- `session.create.before` sets `activeOrganizationId`.
- Tests: sign-up, session, plugin lock.

### S2 Access (parallel with S3)

- `workspaceGuard` membership join, workspace repo and service, and the other call sites from
  section 5 except `credit.repo.ts`.
- Every workspace read switches to `organization_id`. Workspace create writes both columns until S4.
- `user.delete.before` deletes the user's org (section 7).
- Tests: guard, workspace CRUD, last-workspace rule, user deletion.

### S3 Credits (parallel with S2)

- Section 6: spend resolution, balance and usage routes, grant script, credit fixtures.
- Every credit account read switches to `organization_id`. Account create writes both columns until S4.
- Tests: spend, balance, usage, grant.

### S4 Contract

- Migration 3 (contract). The schema drops `owner_id` and `credit_accounts.user_id` and sets
  `organization_id` not null.
- Remove the dual writes (sign-up, workspace create, credit account create) and anything else still
  touching the old columns.
- Re-run the backfill check over all three migrations.
- Update the docs listed under [Docs to update when built](#docs-to-update-when-built). Flip
  this PRD to `implemented` once merged.
- Full API suite and `pnpm check-types`.
