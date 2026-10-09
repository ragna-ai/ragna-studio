# Organizations v2: members, invites, org settings

**Status: implemented** (PR #95, 2026-10-09). Builds on [v1](./prd.md) (PR #94).

## Summary

The org owner (and admins) invite people by email. An invitee signs up and lands in the inviting
org instead of getting an org of their own. Members work in the same workspaces and draw from
the org's credits. An org settings page manages name, members, roles and invitations.

Removing a member or deleting the org is a soft delete with a 30-day recovery window. A daily
cron then hard-deletes the data, including R2 objects.

Before a second member can join, the data model must say what is shared and what is personal.
Workspace work stays with the org when its author leaves. Chats become private to their author.
Personal data (sessions, accounts, mailbox, MCP connections, notifications) goes with the user.

## Problem

v1 put orgs in place, but every org has exactly one member. The plugin's invite routes are
locked, and parts of the code still assume one user per workspace:

- Chat rename and dataset row append/reorder filter by `user_id`, so a colleague gets a 404.
- The default agent is a per-(user, workspace) clone. Under sharing, `isDefault` can sit on a
  colleague's row and nobody's lookup finds it.
- `user_id` on agents, chats, workflows, datasets, generations and social posts cascades on
  user delete. Removing a member would wipe shared work.
- Nothing deletes R2 objects when a user or org goes away.

## Goals

- Owners and admins invite by email. The invitation email goes through the mail queue, and the
  UI shows a copyable link as well.
- An invitee who signs up with the invited email joins the inviting org. No personal org.
- Org settings UI: rename, member list, roles, invitations, ownership transfer, per-member
  credit usage, org deletion.
- Removing a member, a member leaving, and deleting the org are soft deletes, restorable for 30
  days, then hard-deleted with R2 cleanup.
- Shared work survives its author. Personal data and private chats don't.

## Non-goals

- Multi-org membership. A user belongs to exactly one org (see [Decisions](#decisions), 1).
- Inviting a user who already has an account. Rejected at invite time.
- Changing `ALLOWED_LOGIN_EMAILS` semantics. An invited email not on the list still can't sign in.
- Several owners. One owner per org (the role helper tolerates comma-separated roles, so this
  can change later).
- Shareable chats (private by default, shared per chat). Later step.
- Per-user default agent preferences.
- App-level RBAC on workspace resources, per-workspace access, teams.
- Caching the guard's membership query.
- Task reminder recipients beyond the owner (assignee, creator).

## Decisions

| #   | Decision                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **One membership per user.** An invitee joins the inviting org at sign-up and gets no org of their own. `getOrganizationIdByUserId` stays correct, no org switcher. Multi-org would later put the org in the URL. |
| 2   | **Invites only for emails without an account.** `beforeCreateInvitation` rejects an email that belongs to an existing user.                                                                                       |
| 3   | **`ALLOWED_LOGIN_EMAILS` unchanged.** A pending invitation does not bypass it. The invite route rejects a non-allowlisted email early, so the owner gets a clear error instead of a dead invitation.              |
| 4   | **Email and link.** `sendInvitationEmail` enqueues a mail job, and the UI shows the invite link. Without SMTP the job fails as today; the link still works.                                                       |
| 5   | **Plugin defaults for limits**: `invitationLimit` 100 pending, `membershipLimit` 100, expiry 48 h. Owner and admins may invite (plugin default permissions).                                                      |
| 6   | **Shared work keeps the org, authorship becomes `set null`**: workflows, datasets, gen_images, gen_videos, social_posts, agents. Documents, tasks and usage events already work this way.                         |
| 7   | **Chats are private to their author.** Every chat read and write filters by `user_id` inside the workspace. Chats cascade with their author.                                                                      |
| 8   | **One default agent per workspace**, enforced by a partial unique index.                                                                                                                                          |
| 9   | **Personal data cascades with the user**: sessions, accounts, email accounts (and their mail), MCP settings and connections, OAuth tables, notifications, private chats.                                          |
| 10  | **Member soft delete = `users.deleted_at` + `banned = true` + sessions and MCP tokens revoked.** The member row stays, so restore clears two fields. `ban_reason` tells it apart from a platform-admin ban.       |
| 11  | **Owners and admins remove members. Members may leave**, which soft-deletes their own account. The owner can't leave: they transfer ownership or delete the org.                                                  |
| 12  | **Org soft delete = `organizations.deleted_at`.** All members except the owner are banned. The owner can still sign in and only sees a restore page. `workspaceGuard` excludes deleted orgs.                      |
| 13  | **30-day window for members and orgs.** A daily `purge` cron hard-deletes after it. R2 objects are deleted as part of the hard delete, before the rows.                                                           |
| 14  | **One owner.** Ownership transfer is our own endpoint: owner and target swap roles (`owner` ↔ `admin`) in one transaction. Neither an invitation nor the plugin's role route can grant `owner`.                   |
| 15  | **Plugin routes `accept-invitation`, `leave` and `remove-member` are disabled** (`disabledPaths`). Joining happens at sign-up; leaving and removing are soft deletes in our API.                                  |
| 16  | **Platform admin `remove-user` is blocked** while the user owns an org that has other active members. For a sole owner, the hook enqueues an immediate org purge job (same code as the purge cron, R2 included).  |
| 17  | **Workflow runs carry their own user.** `workflow_runs.triggered_by_user_id`: manual runs use the clicking user. Schedule ticks use the author while active, else the org owner.                                  |
| 18  | **Unique index on `members.user_id`.** Decision 1 makes one membership per user final, so a constraint backs it.                                                                                                  |

## Design

### 1. Plugin configuration

`packages/auth/src/server/auth.ts`:

```ts
organization({
  allowUserToCreateOrganization: false,
  disableOrganizationDeletion: true,
  sendInvitationEmail: enqueueInvitationEmail,
  organizationHooks: {
    beforeCreateInvitation: validateInvitation,
    beforeUpdateMemberRole: rejectOwnerRole,
  },
});
```

`invitationLimit` is no longer set, so the plugin default (100) applies. `disabledPaths` gains
`/organization/accept-invitation`, `/organization/leave` and `/organization/remove-member`.

Verified against better-auth 1.7.7 (`plugins/organization/routes/`):

| Fact                                                                                                             | Source                                                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Accepting needs a session, the session email must equal the invitation email, and `emailVerified` must be true.  | `crud-invites.mjs:264-274`                            |
| Accepting creates a member row with no "already in another org" check, then sets the active org.                 | `crud-invites.mjs:324-330`                            |
| `leave` deletes the member row directly and calls no hook.                                                       | `crud-members.mjs:405-430`                            |
| `remove-member` deletes the member row (hook `beforeRemoveMember` exists but can't turn it into a soft delete).  | `crud-members.mjs:213`                                |
| Role updates: only the owner may grant or change `owner`; the last owner can't be demoted.                       | `crud-members.mjs:286-302`                            |
| Roles are comma-separated and split on `,` in permission checks.                                                 | `permission.mjs:4`                                    |
| Invite rejects an email that is already a member or already invited (unless `resend`).                           | `crud-invites.mjs:127-132`                            |
| `membershipLimit` default 100, `invitationExpiresIn` default 48 h.                                               | `crud-invites.mjs:275`, `adapter.mjs:730`             |
| The admin plugin's `session.create.before` rejects `banned` users. Its ban route deletes the user's sessions.    | `admin/admin.mjs:33-49`, `admin/routes.mjs:305`       |
| Invite only stops a non-owner from inviting as `owner`. The owner may invite a second owner.                     | `crud-invites.mjs:123`                                |
| Admin `remove-user` calls `internalAdapter.deleteUser`: `user.delete.before` runs, then the user row is deleted. | `admin/routes.mjs:782`, `db/internal-adapter.mjs:232` |

The routes v2 uses as-is: `invite-member`, `cancel-invitation`, `list-invitations`,
`list-members`, `update` (rename), `update-member-role` (for `admin` ↔ `member`).

### 2. Invites and sign-up

**Creating an invitation.** `beforeCreateInvitation` rejects with a 400 when:

- the role contains `owner` (decision 14),
- a user with that email exists. The message depends on the user's state:
  - removed member of the same org: "This person was removed. Restore them in the member list."
  - soft-deleted in another org: "This person's account is scheduled for deletion."
  - otherwise: "This person already has an account."
- `ALLOWED_LOGIN_EMAILS` is set and the email isn't on it.

**Sending.** `sendInvitationEmail` enqueues `INVITATION_EMAIL_JOB` on the emails queue
(`@repo/queue` DTO with email, inviter name, org name, link). The worker's `email.processor.ts`
renders a new `invitation.vue` template in `@repo/mail`. Skipped in tests, like the welcome email.

**The link** is the web login page with the invitation id: `{webUrl}/auth/login?invitation=<id>`.
The page shows "Sign in with <email> to join". The id is only a hint for the UI; joining is
decided by email at sign-up.

**Joining.** `user.create.after` looks for a pending, unexpired invitation for the new user's
email (lower-cased) whose org isn't soft-deleted:

- Found: create a member row with the invitation's role and mark the invitation `accepted`, in
  one transaction. No personal org, no "Personal" workspace. If several orgs invited the same
  email, the newest invitation wins; the others stay pending and expire.
- Not found: `createOrganizationForUser` as in v1.

`session.create.before` runs after `user.create.after`, so `activeOrganizationId` already points
at the joined org. OAuth providers deliver verified emails, so a different-email sign-in simply
doesn't match and the user gets their own org.

### 3. Shared vs personal data

| Kind                       | Tables                                                                                                                           | On hard delete of the user |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Personal                   | sessions, accounts, email_accounts (+ threads, messages via account), mcp_settings, mcp_connections, OAuth tables, notifications | cascade (unchanged)        |
| Private workspace content  | chats (+ messages, attachments)                                                                                                  | cascade (unchanged)        |
| Shared workspace work      | workflows, datasets, gen_images, gen_videos, social_posts, agents                                                                | `set null` (new)           |
| Shared, already `set null` | documents, tasks, credit_usage_events                                                                                            | `set null` (unchanged)     |

`media.owner_user_id` is unused today and keeps its cascade.

**Authorship columns.** `user_id` on workflows, datasets, gen_images, gen_videos and
social_posts drops `NOT NULL` and its FK becomes `ON DELETE SET NULL`. `agents.user_id` is
already nullable; only its FK action changes. The TS type becomes `string | null`; call sites
that read the author handle `null` ("Former member" in the UI). No data changes, so this is one
migration without backfill.

**Chat privacy.** Every chat repo accessor takes `userId` and `workspaceId` and filters by both:
list, count, get, rename, delete, branch, messages, search (match count, matched chats,
snippets), and attachment access. Consumers to update: `chat.service.ts`, `overview.service.ts`
(recent chats), `media.service.ts` (chat attachments), `task-attachment.service.ts`,
`channel.service.ts` (WS channel, already user-only, gains the workspace), `workspace.controller.ts`
and `credit.service.ts` where they read chats. A colleague's chat id returns 404.
Chat attachments are private too: the media library and media download hide media whose only
references are attachments of other users' chats. Media also used elsewhere (task, social post,
generation) stays visible.
Chats created by workflow runs (`agent.executor.ts`) belong to the run's user (below).

**Workflow run user** (decision 17). Today the worker uses `run.workflow.userId` as the
executor's `userId` (`engine.ts:126`) and as the notification recipient
(`workflow.processor.ts:114`). That id feeds credit usage events, chats created by agent nodes,
tool and team executors, and the success/failure notifications. Once `workflows.user_id` can be
null, it can't carry this. New column `workflow_runs.triggered_by_user_id` (nullable, FK
`users.id ON DELETE SET NULL`), set when the run is created:

- Manual run: the user who clicked run.
- Schedule tick: the workflow author if not null and not soft-deleted, else the org owner.

The engine and the notification read `run.triggeredByUserId` instead of `run.workflow.userId`.
Existing runs are backfilled from `workflows.user_id` in the same migration (a `--custom` step,
see [Migrations](#7-migrations)). A run whose user is later purged keeps its history with
`triggered_by_user_id` null; the engine only reads it for runs that are executing.

**Dataset filters.** `dataset.repo.ts:435` and `:505` filter by `workspace_id` instead of
`user_id`. Any member may append and reorder rows.

**Default agent.** `getOrCreateDefaultAgentForUser` becomes `getOrCreateDefaultAgentForWorkspace`.
Clearing other defaults filters by workspace only. The two existing indexes are dropped:
`agent_default_per_workspace_idx` on `(user_id, workspace_id)` and `agent_default_unassigned_idx`
on `(user_id)` (dead code: `agents.workspace_id` is `NOT NULL`). A new partial unique index
`agent_default_workspace_idx` on `(workspace_id) WHERE is_default` enforces one per workspace. With one member per org
today there is at most one default per workspace, but the migration check verifies it before the
index is created (see [Migrations](#7-migrations)).

### 4. Member lifecycle

New columns: `users.deleted_at` (timestamp, nullable).

`ban_reason` values (constants in `@repo/database`):

- `member_removed`: removed by an owner or admin, or left on their own.
- `organization_deleted`: the org is soft-deleted.

**Soft delete a member** (remove or leave), in one transaction plus best-effort side effects:

1. `users.deleted_at = now()`, `banned = true`, `ban_reason = 'member_removed'`.
2. Delete the user's sessions.
3. Delete their `mcp_connections` and OAuth refresh tokens and consents. MCP access tokens are
   JWTs checked by signature (`mcp.service.ts:177`); without a connection row
   `resolveMcpConnectionScope` returns 401. Restore means reconnecting Claude Desktop.

The member row stays, so they show up in the member list as "Removed, deleted on <date>".
Invitations they sent stay during the window. At hard delete, `invitations.inviter_id` cascades
and removes them. Accepted: invitations expire after 48 h, so nothing pending is lost, only
invitation history.

**Restore** (owner or admin, within 30 days): clear `deleted_at`, `banned`, `ban_reason`.

**Rules:**

- Owners and admins remove members. Nobody removes the owner.
- A member or admin can leave (= soft-delete their own account). The owner can't.
- The email-sync cron skips users with `deleted_at` set, and owners of a deleted org.

**Ownership transfer** (owner only): target must be an active member. In one transaction the
target becomes `owner` and the current owner becomes `admin`. `beforeUpdateMemberRole` rejects
any role containing `owner`, so the plugin route can't create a second owner.

**Owner check helper.** `hasOrganizationRole(member.role, role)` splits on `,`. It replaces the
`member.role = 'owner'` string comparisons in `organization.repo.ts`, `task.repo.ts` (reminder
cron) and anything new. SQL-side checks use the same split semantics
(`'owner' = ANY(string_to_array(role, ','))`).

**Per-member credit usage.** The org usage view groups `credit_usage_events` by `user_id` in one
query. Owner and admins only. Rows with `user_id` null show as "Former member".

### 5. Org lifecycle

New column: `organizations.deleted_at` (timestamp, nullable).

**Soft delete** (owner only, after typing the org name in the UI):

1. `organizations.deleted_at = now()`.
2. Every other member who isn't already removed: `deleted_at`, `banned`,
   `ban_reason = 'organization_deleted'`, sessions deleted.
3. Every member's MCP connections and tokens deleted, the owner's included.
4. Pending invitations cancelled.

**While deleted:**

- `workspaceGuard`'s join adds `organizations.deleted_at IS NULL` (same single query). This blocks
  all workspace routes, MCP tool calls through the guard, and credit spend.
- `/workspace` and `/credit` routes return 403 `ORGANIZATION_DELETED`.
- `GET /organization` still answers, with `deletedAt`, so the web shows the restore page.
- Crons skip deleted orgs: task reminders, workflow schedule ticks, email sync (banned members
  and the owner).
- Accepted gap: the owner can still use the routes outside workspaces (`/email`,
  `/mcp-settings`, `/notification`, `/media`, WS). These are personal or read-only for them, and
  the web only shows the restore page.

**Restore** (owner, within 30 days): `organizations.deleted_at` is cleared. For every member
whose `ban_reason` is `organization_deleted`, all three fields are cleared: `deleted_at`,
`banned`, `ban_reason`. Leaving `deleted_at` set would let the purge cron delete restored members.
Members removed individually stay removed.

### 6. Hard delete: the `purge` cron

New daily worker cron `apps/worker/src/crons/purge.cron.ts`. Each step runs independently, like
`cleanup.cron.ts`. Batched per run, so one bad row doesn't block the rest.

**Orgs** with `deleted_at < now() - 30 days`, per org, through one shared function
`purgeOrganization({ organizationId })` (also used by the purge job below):

1. R2: `deleteWorkspaceMediaObjects` for each of the org's workspaces. The helper moves from
   `apps/api/src/services/media.service.ts` to `@repo/media`, which already owns
   `sweepUnreferencedMedia` and is reachable from both apps.
2. Delete the member users other than the owner.
3. Delete the org row. The FK cascade removes workspaces (with their resources), members,
   invitations and the credit account.
4. Delete the owner user, if still present.

**Users** with `deleted_at < now() - 30 days` whose org isn't deleted: delete the user row. FKs
null authorship and cascade personal data and private chats. Chat attachments become
unreferenced media, which the existing `media-sweep` cron deletes from R2 within 24 h.

Purge deletes rows directly through repos, not through `auth.api`, so `user.delete.before` doesn't
run. That hook keeps serving the platform admin's `remove-user` only:

- The user owns an org with other active members: throw (block). The admin bans instead, or the
  owner transfers ownership first.
- Sole owner: enqueue a `PURGE_ORGANIZATION_JOB` for the org and return. better-auth deletes the
  user row right after the hook (`internal-adapter.mjs:232`); the member row cascades. The worker
  job runs `purgeOrganization` at once, R2 first. `@repo/auth` already depends on `@repo/queue`,
  so no new dependency edge. Until the job runs, the org has no members, so nobody can reach it.
- Not an owner: no extra work; the FKs handle it.

### 7. Migrations

| Slice | Name                         | Content                                                                                                                                                      | Kind        |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| S1    | `shared_authorship`          | Drop `NOT NULL` and switch FKs to `SET NULL` on the authorship columns. Swap the default-agent indexes. Add `workflow_runs.triggered_by_user_id` (nullable). | drizzle-kit |
| S1    | `workflow_run_user_backfill` | `UPDATE workflow_runs SET triggered_by_user_id = workflows.user_id` with a row-count notice                                                                  | `--custom`  |
| S3    | `member_unique_user`         | Unique index on `members.user_id`                                                                                                                            | drizzle-kit |
| S3    | `member_soft_delete`         | `users.deleted_at`                                                                                                                                           | drizzle-kit |
| S4    | `organization_soft_delete`   | `organizations.deleted_at`                                                                                                                                   | drizzle-kit |

No column is renamed or replaced, so no expand/contract split. The only backfill is
`triggered_by_user_id`, a pure add-then-fill. Rules from v1 still apply:

- Run `db:generate --explain` first and stop on `missing_hints`.
- Never edit generated SQL or snapshots.
- Never `db:push`, `db:migrate` or `db:baseline` against the dev database.

**Check before the default-agent index.** On a scratch database with `main`'s migrations and
seeded data, `SELECT workspace_id FROM agents WHERE is_default GROUP BY 1 HAVING count(*) > 1`
must return no rows, and the S1 migration must apply. If it does return rows, stop and report:
the fix is a `--custom` dedupe migration before the index, which needs a decision on which
default survives.

**Same check for `members.user_id`.** `SELECT user_id FROM members GROUP BY 1 HAVING count(*) > 1`
must return no rows before S3's index. v1 creates exactly one membership per user, so it should.
Also verify on the scratch database that every `workflow_runs` row has `triggered_by_user_id`
after the backfill.

### 8. API

New `organizationController` at `/organization` in `apps/api`, thin controller, logic in
`organization.service.ts`. The org is the caller's membership (decision 1).

| Route                                          | Who           | Effect                                |
| ---------------------------------------------- | ------------- | ------------------------------------- |
| `GET /organization`                            | member        | Org name, role of caller, `deletedAt` |
| `DELETE /organization`                         | owner         | Soft delete (section 5)               |
| `POST /organization/restore`                   | owner         | Restore                               |
| `POST /organization/transfer-ownership`        | owner         | Body `{ memberId }`                   |
| `DELETE /organization/members/:memberId`       | owner, admin  | Soft-delete the member                |
| `POST /organization/members/:memberId/restore` | owner, admin  | Restore the member                    |
| `POST /organization/leave`                     | member, admin | Soft-delete own account               |
| `GET /organization/usage`                      | owner, admin  | Credit usage grouped by member        |

Except for `GET /organization` and `POST /organization/restore`, every route returns 403 while
the org is deleted.

### 9. Web

- `organizationClient()` in `packages/auth/src/client`.
- `pages/settings/organization.vue`: rename, member list (role select, remove, restore, removed
  badge with date), invitations (invite dialog with role, copy link, cancel), transfer
  ownership, per-member usage, danger zone (delete org, confirm by typing the name).
- Restore page for the owner of a deleted org, shown instead of the app.
- `pages/account`: "Delete my account" for members and admins (= leave). The owner sees a hint to
  transfer ownership or delete the org.
- `pages/auth/login.vue`: invitation hint when `?invitation=` is present.
- Author fields render "Former member" for `null`.
- The banned-user message on login distinguishes `member_removed` and `organization_deleted`.

### 10. Tests

Test-driven, per `apps/api` rules. At least:

- Invite: existing-account email rejected, with the removed-member and scheduled-deletion
  messages; `owner` role rejected, also for the owner; non-allowlisted email rejected when the
  list is set; owner and admin may invite, member may not; the email job is enqueued (not in
  tests).
- Sign-up with a pending invitation joins that org with the invited role, creates no org, marks
  the invitation accepted, and the session's `activeOrganizationId` is the joined org. Expired
  invitation or invitation of a deleted org: own org as before.
- Disabled plugin routes return 404.
- Chats: a colleague's chat is invisible in list, get, search, overview, rename, delete,
  branch, attachments and the WS channel.
- Datasets: a colleague can append and reorder rows.
- Default agent: one per workspace, shared by members.
- Workflow runs: a manual run records the clicking member; a schedule tick records the author,
  or the owner once the author is null or soft-deleted; usage events, agent-node chats and
  notifications go to that user.
- Authorship: hard-deleting a member keeps their workflows, datasets, generations, social posts
  and agents with `user_id` null, and deletes their chats and personal data.
- Member soft delete: banned, sessions gone, MCP connection gone, sign-in rejected; restore
  re-enables; owner can't be removed or leave; admin can't remove the owner.
- Ownership transfer swaps roles; the plugin role route can't set `owner`.
- Org soft delete: guard rejects members' workspace requests; owner sees `GET /organization`
  with `deletedAt`; restore clears `deleted_at`, `banned` and `ban_reason` only for
  `organization_deleted` members, and a later purge run leaves them alone.
- Purge: rows past 30 days are hard-deleted, R2 objects deleted first (storage mocked), rows
  inside the window untouched.
- Platform admin `remove-user`: blocked with active members; for a sole owner the purge job is
  enqueued, and running it removes the org, its workspaces and R2 objects.

## Considered

**Multi-org membership with `activeOrganizationId` as selector.** Matches the plugin's flow, but
the session would choose scope, which breaks "the URL is the sole scope carrier".

**Org id in the URL** (`/organizations/:orgId/...`). Keeps the URL rule with multi-org. Most API
and UI work for a case we don't need yet. The path if multi-org ever comes.

**Delete a leaving member's work.** Breaks colleagues' workflows and agents, and is inconsistent
with documents and tasks, which already survive. Rejected.

**Reassign a leaving member's work to the remover.** No nullable columns, but false authorship.

**`members.removed_at` instead of a ban.** Plugin routes don't know the column, so a removed
member keeps org permissions through them.

**Shared chats (status quo).** No work, but chats are treated as private by users. Shareable
chats come later.

**R2 cleanup 30 days after the hard delete.** Needs a table of pending object keys, because the
rows are gone. No benefit over cleaning up at the hard delete.

**Ban everyone including the owner on org delete.** Nobody on a self-hosted instance could undo it.

## Docs to update when built

- `specs/organizations/prd.md`: link to this PRD from "v2 topics".
- `specs/api-standards/prd.md`: chats as the exception to "workspace is the access boundary".
- `specs/workspaces/workspaces.md`: member access, default agent per workspace.
- `specs/credits/prd.md`: per-member usage.
- `specs/overview.md`: org settings, invites.
- Self-hosting docs (`apps/docs`): invitations need SMTP for email, the link works without it.

## Rollout

One PR, one agent per slice, one commit per slice. TDD in every slice.

```text
S1 Shared data ──┐
S2 Invites ──────┼── S3 Member lifecycle ── S4 Org lifecycle + purge ── S5 Web
```

S1 and S2 run in parallel. S3 needs S1 (authorship) and S2 (`disabledPaths`, hooks in
`auth.ts`). S4 builds on S3's soft delete. S5 needs the API from S2 to S4.

### S1 Shared data

- Authorship `set null` on 6 tables, TS fallout, "Former member" handling in API responses.
- `workflow_runs.triggered_by_user_id`, backfill, engine and notification switch to it.
- Chat privacy across all accessors and consumers (section 3).
- Dataset filters workspace-scoped.
- Default agent per workspace: drop both old indexes, add the new one, migration check.
- Migrations `shared_authorship` and `workflow_run_user_backfill`.

### S2 Invites

- Plugin config: `invitationLimit` default, `sendInvitationEmail`, `beforeCreateInvitation`,
  `disabledPaths`.
- Invitation email job, DTO, processor case, `invitation.vue` template.
- `user.create.after` join path.
- `hasOrganizationRole` helper and its use in existing owner checks.
- `beforeCreateInvitation` rejects `owner`; `beforeUpdateMemberRole` rejects `owner`.
- No migration: S1 runs in parallel, and two migrations generated from the same parent snapshot
  collide.

### S3 Member lifecycle

- `users.deleted_at`, ban reasons, soft delete, restore, leave, MCP revocation.
- Ownership transfer.
- Migration `member_unique_user`, with its duplicate check.
- `organizationController` with member routes, `GET /organization`, `/organization/usage`.
- Email-sync cron skips deleted users.
- Migration `member_soft_delete`.

### S4 Org lifecycle and purge

- `organizations.deleted_at`, soft delete, restore, guard filter, `ORGANIZATION_DELETED` on
  `/workspace` and `/credit`, cron filters.
- Move `deleteWorkspaceMediaObjects` to `@repo/media`.
- `purge` cron for users and orgs.
- `purgeOrganization` shared by the cron and `PURGE_ORGANIZATION_JOB`.
- `user.delete.before` for platform admin `remove-user`.
- Migration `organization_soft_delete`.
- Docs update, full API suite, `pnpm check-types`.

### S5 Web

- Section 9. No API changes. Flip this PRD to `implemented` once merged.
