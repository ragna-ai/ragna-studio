# Organizations v3: personal and restricted workspaces

**Status: implemented** (PR #97, 2026-10-10). Builds on [v1](./prd.md) (PR #94) and [v2](./v2-prd.md) (PR #95).

## Summary

Every workspace gets a visibility, chosen at creation: `personal`, `organization` or
`restricted`. Every new user gets a personal workspace that only they can open. Restricted
workspaces are open to a list of workspace members, run by workspace managers. Organization
workspaces work as all workspaces do today.

Every org member may create organization or restricted workspaces. Org owners and org admins
have full access to every non-personal workspace. Nobody else ever opens a personal workspace.

Workspace roles are `manager` and `editor`. Managers run the workspace (workspace members,
rename, delete); editors work with its content. A `viewer` role comes with the RBAC PRD.

## Glossary

"admin" and "member" each mean several things in this codebase. This PRD and the v3 code never
use them unqualified.

| Term              | Meaning                                                                  | Stored as                            | Code                                                   |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------ |
| platform admin    | Instance operator (better-auth admin plugin)                             | `users.role = 'admin'`               | `user.role`                                            |
| org member        | Anyone with an org membership, whatever the org role                     | a row in `members`                   | `organizationMember` (Drizzle export, was `member`)    |
| org owner         | Org role `owner` (one per org)                                           | `members.role` contains `owner`      | `ORGANIZATION_OWNER_ROLE`                              |
| org admin         | Org role `admin`                                                         | `members.role` contains `admin`      | `ORGANIZATION_ADMIN_ROLE`                              |
| org role `member` | The plain org role, neither owner nor admin                              | `members.role` contains `member`     | `ORGANIZATION_MEMBER_ROLE` (was `DEFAULT_MEMBER_ROLE`) |
| workspace member  | Anyone with a row in `workspace_members`                                 | a row in `workspace_members`         | `workspaceMember` (Drizzle export)                     |
| workspace manager | Workspace role `manager`: runs the workspace                             | `workspace_members.role = 'manager'` | `WORKSPACE_MANAGER_ROLE`                               |
| workspace editor  | Workspace role `editor`: works with the content                          | `workspace_members.role = 'editor'`  | `WORKSPACE_EDITOR_ROLE`                                |
| workspace role    | The caller's effective role in a workspace (section 2), not only the row | computed                             | `WorkspaceRole`, `workspaceRole`                       |

Identifiers use full words: `organizationRole`, `workspaceRole`, `organizationMember`,
`workspaceMember`. Never a bare `role`, `member` or `admin` where both levels are in scope.
Org role values stay better-auth's `owner`, `admin` and `member`: renaming them would need
custom access-control roles and a migration of `members.role` in prod.

## Problem

v2 made all org members share all org workspaces. The sign-up "Personal" workspace is
org-wide, only personal by name. Teams can't keep work to a smaller group, and a user has no
place of their own. Any org member can rename or delete any workspace.

v1 and v2 code also says `member` and `admin` without saying which level. That gets ambiguous
once workspaces have roles of their own.

## Goals

- Every new user (own org or invitee) gets a personal workspace at sign-up.
- Workspaces are created as `organization` or `restricted`. Restricted is the default in the UI.
- Restricted workspaces have workspace members with the roles `manager` and `editor`.
- Running a workspace (rename, delete, workspace members) is limited to workspace managers.
- Every access path enforces visibility: REST guard, WS chat, MCP, email attachments, schedules.
- Org and workspace roles have distinct names in prose, code and stored values.

## Non-goals

- The `viewer` role and further RBAC on workspace resources. Separate PRD.
- Shareable chats. A feature of its own, with WS implications.
- Inviting existing accounts, multi-org membership.
- Co-owners.
- Task reminder recipients beyond the org owner. Touches notifications;
- Org-scoped shared resources (agent templates, media, integrations).
- Seats and per-member billing.
- Per-user default agent preference, caching the guard's membership query.
- Worker tests and v2 hardening. Separate PRD.
- Renaming the org role values or the `members` table.

## Decisions

| #   | Decision                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Own table `workspace_members`**, not better-auth teams. Teams have no role per team member (`teamMember` is `id, teamId, userId, createdAt`), so roles would need a second table anyway.                                            |
| 2   | **`workspaces.visibility`**: `personal`, `organization` or `restricted`. Fixed at creation.                                                                                                                                           |
| 3   | **Every new user gets a personal workspace** at sign-up, also invitees. A new org gets no other workspace.                                                                                                                            |
| 4   | **Existing workspaces become `organization`** through the column default. **Every existing user gets a personal workspace** through a backfill migration (amendment 1, replaces "forward only").                                      |
| 5   | **Every org member may create** `organization` or `restricted` workspaces. Personal workspaces are only created at sign-up.                                                                                                           |
| 6   | **Org owners and org admins have full access** to every `organization` and `restricted` workspace, as workspace manager. Never to personal workspaces.                                                                                |
| 7   | **Workspace roles `manager` and `editor`.** Managers rename, delete and manage workspace members. The creator becomes manager. Org owners and org admins are managers too (decision 6). The personal workspace's user is its manager. |
| 8   | **Personal workspaces can't be deleted.** The "org keeps at least one workspace" rule is dropped. A user with no accessible workspace sees an empty state.                                                                            |
| 9   | **Org owners and org admins find restricted workspaces in org settings**, not in the switcher, unless they are workspace members.                                                                                                     |
| 10  | **Schedules run as the workflow author, or pause.** A tick runs only when the author is active and can access the workspace. Otherwise it skips. The org owner fallback from v2 is removed. No new columns.                           |
| 11  | **A paused schedule shows as a badge only.** No notification.                                                                                                                                                                         |
| 12  | **A removed org member's personal workspace** stops its schedules at soft delete (decision 10) and is purged with the user after 30 days.                                                                                             |
| 13  | **Chats stay private to their author** in every visibility (v2 decision 7). Full access in decision 6 covers workspace content, not other users' chats.                                                                               |
| 14  | **Qualified names everywhere** (see [Glossary](#glossary)). Workspace role values differ from org role values. S0 renames the v1/v2 identifiers before any v3 slice starts.                                                           |

## Amendment 1 (2026-10-10)

Email automation moves into the private workspace (see
[email private workspace change request](../email/private-workspace-change-request.md)). Every
user therefore needs a private workspace, so decision 4 changes from "forward only" to a
backfill for all existing users (section 8, slice S5). It ships in PR #97, so prod never has
users without one. The empty state (decision 8) stays for edge cases.

## Design

### 0. Naming (S0)

A pure rename, no schema or behaviour change:

- Drizzle export `member` becomes `organizationMember` (table `members` unchanged). Its
  `relations.ts` key and every `db.query.member` / `member.*` call site follow.
- better-auth must still find the model. The Drizzle adapter looks up `schema[model]`
  (`@better-auth/drizzle-adapter/dist/index.mjs:62`), and the plugin's model name is `member`.
  Wire it either through the organization plugin's `schema.member.modelName` or with an explicit
  `member: organizationMember` key in the adapter's schema. S0 verifies which one works against
  the installed adapter and keeps plugin routes green.
- `DEFAULT_MEMBER_ROLE` becomes `ORGANIZATION_MEMBER_ROLE`. Bare `role` and `member` variables
  in org code (`organization.repo.ts`, `organization.service.ts`, `organization.controller.ts`,
  `organization-removal.ts`, `purge.service.ts`, the auth hooks) become `organizationRole` and
  `organizationMember`.
- API response fields keep their names, so the web needs no change.

### 1. Schema

`workspaces`:

| Column             | Type                                                           |
| ------------------ | -------------------------------------------------------------- |
| `visibility`       | `text NOT NULL DEFAULT 'organization'`, typed as a union in TS |
| `personal_user_id` | `text NULL`, FK `users.id ON DELETE CASCADE`                   |

- Unique index on `personal_user_id` (one personal workspace per user; nulls don't collide).
- Check constraint: `(visibility = 'personal') = (personal_user_id IS NOT NULL)`.
- Check constraint: `visibility IN ('personal', 'organization', 'restricted')`.

New table `workspace_members` (Drizzle export `workspaceMember`):

| Column         | Type                                           |
| -------------- | ---------------------------------------------- |
| `id`           | primary id                                     |
| `workspace_id` | FK `workspaces.id ON DELETE CASCADE`, not null |
| `user_id`      | FK `users.id ON DELETE CASCADE`, not null      |
| `role`         | `text NOT NULL`, `manager` or `editor`         |
| timestamps     |                                                |

- Unique index on `(workspace_id, user_id)`, index on `user_id`.
- Check constraint: `role IN ('manager', 'editor')`.
- Registered in `relations.ts` (workspace has many workspace members, user has many workspace
  memberships).

Personal workspaces have no `workspace_members` row. In `organization` workspaces, rows only
carry `manager` (the creator and promoted managers). In `restricted` workspaces, rows are the
list of workspace members.

**Same-org check** in the service when a row is added: the user must be an active org member
of the workspace's org (one query, compared in SQL). A composite FK would need
`organization_id` on `workspace_members` and a `NO ACTION` FK onto `members`, which conflicts
with the user cascade (see [Considered](#considered)).

Soft-deleted org members keep their rows, so a restore brings their access back. A hard delete
cascades the rows.

### 2. Access

`getWorkspaceForMember` becomes `getWorkspaceAccess({ workspaceId, userId })`. It returns a
named interface `WorkspaceAccess { workspace: Workspace; workspaceRole: WorkspaceRole }` or
`null`. One query: workspace, org membership, org not deleted, left join on
`workspace_members` for the user.

| Visibility     | Access when                                        | `workspaceRole`                                                   |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `personal`     | `personal_user_id = user`                          | `manager`                                                         |
| `organization` | org member                                         | `manager` if org owner, org admin or `manager` row; else `editor` |
| `restricted`   | org owner, org admin, or a `workspace_members` row | `manager` if org owner or org admin; else the row's role          |

Org roles are compared with `organizationRoleMatches` (comma-separated roles).

Consumers:

- `workspaceGuard`: sets `workspace` and `workspaceRole` in the context.
- `channel.service.ts` (`canAccessChat`): uses the new function.
- **WS chat messages re-check access.** `ws.controller.ts` caches granted channels at subscribe
  (`grantedChannels`), so a user removed from a restricted workspace could keep chatting on an
  open socket. The `message` case re-runs `canAccessChat` before `runChatStream`, next to the
  existing session check.
- **MCP requests re-check access.** `mcp.service.ts` reuses `connection.workspaceId` per request
  without a check. `findMcpConnection` joins the access predicate, so a connection to a
  workspace the user lost returns null and the existing "reconnect" error applies. No extra
  query.
- `mcp-settings.service.ts` (connect): uses the new function.
- `email.service.ts:1454` (media attachments): uses the list of accessible workspaces instead of
  all org workspaces.

**Workspace list for a user** (`listAccessibleWorkspaces`): organization workspaces of the org,
the user's personal workspace, and restricted workspaces where the user is a workspace member.
Each entry carries `visibility` and the caller's `workspaceRole`. Org owners and org admins
don't get every restricted workspace here (decision 9).

`getAllWorkspacesByOrganizationId` stays for the purge, which needs every workspace.

### 3. Sign-up

- `createOrganizationForUser` creates the org, the org owner's membership and a `personal`
  workspace named "Private" (`PERSONAL_WORKSPACE_NAME`) with `personal_user_id`, in one
  transaction. "Private" reads the same in EN and DE; "Personal" means staff in German. The
  name is stored and can be renamed.
- `joinOrganizationFromPendingInvitation` also creates the invitee's personal workspace in the
  inviting org, in the same transaction as the org membership.

### 4. Workspace API

`workspace.controller.ts` (no guard today; the service checks access):

| Route                            | Who               | Change                                                                                                                                            |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /workspace`                 | org member        | Accessible list with `visibility` and `workspaceRole`                                                                                             |
| `POST /workspace`                | org member        | Body gains `visibility` (`organization` or `restricted`, required) and `memberUserIds` (optional, restricted only). Creator gets a `manager` row. |
| `PATCH /workspace/:workspaceId`  | workspace manager | Was any org member                                                                                                                                |
| `DELETE /workspace/:workspaceId` | workspace manager | Was any org member. Personal: 400. The "only workspace" rule is dropped.                                                                          |

`visibility` becomes a required field on `POST /workspace`. That is an API break; the web
client ships in the same release.

`memberUserIds` must all be active org members of the same org, checked in one `inArray`
query. Unknown or foreign ids return 400. They join as workspace editors.

New `workspace-member.controller.ts` at `/workspace/:workspaceId/members`, behind
`authMiddleware` and `workspaceGuard`. Thin controller, logic in `workspace-member.service.ts`.

| Route             | Who                          | Effect                                                                     |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `GET /`           | anyone with workspace access | Workspace members with user name, email, image, `workspaceRole`            |
| `POST /`          | workspace manager            | Body `{ userId, workspaceRole }`. Organization workspaces: `manager` only. |
| `PATCH /:userId`  | workspace manager            | Body `{ workspaceRole }`                                                   |
| `DELETE /:userId` | workspace manager, or self   | Removes the row. Self = leave.                                             |

All workspace member routes return 400 on personal workspaces. Removing the last workspace
manager is allowed: org owners and org admins can still run the workspace.

`organization.controller.ts` gains `GET /organization/workspaces` (org owner, org admin): every
restricted workspace of the org with its workspace member count and whether the caller is a
workspace member. One query with `GROUP BY`.

### 5. Existing behaviour that changes

- Org members with the org role `member` can no longer rename or delete existing workspaces.
  Those have no `manager` row (decision 4), so only org owners and org admins run them.
- Schedule ticks no longer fall back to the org owner (section 6).
- `POST /workspace` requires `visibility`.
- Invitees get a personal workspace, contrary to v2 section 2.
- Every existing user gets a personal workspace named "Private" at upgrade (amendment 1).

### 6. Schedules

`resolveScheduledRunUserId` (`workflow.repo.ts`) returns the author only if the author is not
null, not soft-deleted, and passes the access predicate of section 2 for the workflow's
workspace. Otherwise it returns null. The predicate is shared SQL, not a second implementation.

`processScheduleTick` skips the tick when the result is null: it logs "schedule paused",
creates no run and keeps the job scheduler, so the schedule resumes once the author can run
it again. This also covers decision 12: a soft-deleted author pauses the schedules in their
personal workspace.

Workflow list and get responses gain `schedulePaused: boolean` for scheduled workflows,
computed in the same query (no N+1).

Consequence: if the author is purged (`user_id` null), the schedule stays paused for good.
Manual runs still work. To schedule it again, someone creates a new workflow.

### 7. Purge and removal

- `purgeExpiredDeletions`: before `deleteUsersByIds` for a user, delete the R2 objects of
  their personal workspace with `deleteWorkspaceMediaObjects`. Incomplete cleanup throws before
  any row is touched, as for orgs.
- `purgeOrganization`: unchanged. It already iterates all workspaces of the org, personal ones
  included.
- `prepareUserRemoval` (platform admin `remove-user`) of a user who isn't an org owner:
  reads the `{ bucket, key }` of every media row in the personal workspace before
  better-auth deletes the user row (the rows cascade with it), and enqueues
  `DELETE_MEDIA_OBJECTS_JOB` jobs on the purge queue in one `addBulk` call (max 1000 objects
  per job, 3 attempts). The worker deletes them with `deleteMediaObjectsByKeys`
  (`@repo/media`). An enqueue failure is logged and never blocks the removal. `@repo/auth`
  does not depend on `@repo/media`.
- **The media sweep cron does not cover this.** `sweepUnreferencedMedia` starts from media
  rows (`findUnreferencedMediaOlderThan`) and never lists the bucket. `media.workspace_id`
  cascades, so once a workspace row is gone, its objects are invisible to the sweep and stay
  in R2 for good. Every path that deletes a workspace or its user must hand over the keys
  first.

### 8. Migrations

| Slice | Name                         | Content                                                                                                         | Kind        |
| ----- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------- |
| S1    | `workspace_visibility`       | `workspaces.visibility` (default `organization`), `personal_user_id`, checks, unique index; `workspace_members` | drizzle-kit |
| S5    | `private_workspace_backfill` | One personal workspace per existing user (amendment 1)                                                          | `--custom`  |

S0 renames only TypeScript identifiers, so `drizzle-kit generate` must report no changes after
it. S1 is a pure expand: the default keeps existing rows valid, no contract step.

**Backfill** (S5, amendment 1). For every row in `members` whose user has no personal workspace
yet, insert a workspace in that membership's org: `id = uuidv7()` (Postgres 18 built-in, which
v0.6.0 already requires), name `'Private'` (same value as `PERSONAL_WORKSPACE_NAME`),
`visibility = 'personal'`, `personal_user_id = members.user_id`, `created_at` and `updated_at`
`now()`. `NOT EXISTS` on `personal_user_id` makes it idempotent; the unique index backs it.
Soft-deleted users and members of soft-deleted orgs are included: a restore needs the
workspace, and the purge removes it. End with a row-count `RAISE NOTICE`.

- Run `db:generate --explain` first and stop on `missing_hints`.
- Never edit generated SQL or snapshots.
- Never `db:push`, `db:migrate` or `db:baseline` against the dev database.
- On a scratch database with `main`'s migrations and seeded data: the migration applies, every
  existing workspace reads `organization`, and both check constraints hold.
- S5 scratch check: seed users (one with a personal workspace already, one soft-deleted, one
  in a soft-deleted org), apply up to S1, then the backfill. Every user has exactly one personal
  workspace in their org, running the backfill twice changes nothing, and a real `migrate.ts`
  run on a fresh scratch database passes.

### 9. Web

- **Switcher** (`WorkspaceSwitcher.vue`): groups personal, organization and restricted
  workspaces. Restricted ones get a lock icon.
- **Create dialog**: name, visibility (restricted preselected), picker for workspace members
  of a restricted workspace.
- **Manage dialog** (`WorkspaceManageDialog.vue`): rename and delete only for workspace
  managers; no delete for personal. A "Workspace members" tab for restricted workspaces (add,
  remove, manager or editor) and a "Managers" list for organization workspaces. "Leave
  workspace" for workspace members.
- **Org settings** (`pages/settings/organization.vue`): "Restricted workspaces" section for org
  owners and org admins, with workspace member count. "Open" when the caller is a workspace
  member. Otherwise "Join as manager", which adds a `manager` row so the workspace appears in
  the switcher. API access stays full without a row (decision 6); the web only selects listed
  workspaces.
- **Empty state** when `GET /workspace` returns nothing: "Create a workspace".
- **Workflows**: "Schedule paused" badge with the reason in list and editor.
- UI labels follow the glossary: "Manager" and "Editor" for workspace roles, "Owner", "Admin"
  and "Member" stay for org roles on the org settings page only.
- All new strings in DE and EN.

### 10. Tests

Test-driven, per `apps/api` rules. At least:

- S0: the full suite stays green, including the better-auth organization routes (invite,
  rename, role change); `drizzle-kit generate` reports no changes.
- Sign-up creates a personal workspace for a new org and for an invitee.
- Personal: only its user gets in. Org owner and org admin get 404. Delete returns 400.
  Workspace member routes return 400.
- Organization: every org member gets in. Rename and delete: workspace managers only, an org
  member with the org role `member` and no `manager` row gets 403.
- Restricted: workspace members, org owners and org admins get in; other org members get 404.
  A removed workspace member loses access at once.
- Create: `visibility` required; creator gets `manager`; `memberUserIds` from another org or
  soft-deleted rejected; the rest join as editors.
- Workspace member routes: a manager adds, changes the role, removes; an editor may leave; an
  editor can't add; organization workspaces accept only `manager` rows.
- Workspace list returns the accessible set with `workspaceRole`; the org owner doesn't see
  restricted workspaces they aren't a workspace member of. `GET /organization/workspaces`
  lists them for org owners and org admins only.
- WS: a user removed from a restricted workspace gets an error on the next message of an open
  socket.
- MCP: a connection to a workspace the user lost fails with the reconnect error.
- Email attachments: media of an inaccessible workspace is rejected.
- Schedules: author with access runs; author removed from a restricted workspace,
  soft-deleted or null skips with no run row; `schedulePaused` reflects it.
- Purge: a purged user's personal workspace R2 objects are deleted first (storage mocked).

## Considered

**better-auth teams.** Plugin routes and `activeTeamId` for free, but no role per team member,
team invites we'd have to lock down like v2's routes, and a second table for roles anyway.

**Workspace roles `admin` and `member`.** Short, but the same values as the org roles, and
`admin` is also the platform admin's `users.role`. Only identifiers would tell them apart.

**Workspace roles `manager` and `contributor`.** Also distinct, but the RBAC PRD would likely
rename `contributor` once `viewer` exists. `editor` already fits beside a later `viewer`.

**Renaming the org role values** (e.g. `org_admin`). Needs better-auth custom access-control
roles and a data migration of `members.role` in prod, for little gain once identifiers are
qualified.

**`orgX` / `spaceX` prefixes.** Shorter, but "space" appears nowhere in the codebase, and `org`
prefixes would sit beside the existing `organizationId`.

**Visibility by creator role** (org admins create org-wide, others create restricted). Couples
two questions: org admins couldn't create a restricted workspace, others couldn't create a
shared one.

**Only org owners and org admins create workspaces**, or a setting to restrict creation
(Notion, Linear). Rejected for max freedom. A setting can come later.

**Org admins see restricted workspaces only after joining** (Linear Business). Auditable, but
more UI and a second access state. Full access chosen.

**Forward only (no personal workspace for pre-v3 users).** The original decision 4. Replaced by
amendment 1: email automation moves into the private workspace, so every user needs one.

**Create the private workspace on demand** (first time mail needs it). No mass backfill, but
every path that needs it would have to create it lazily. Rejected for the backfill.

**Keep "the org keeps one workspace" or "nobody loses their last workspace".** The first no
longer fits personal workspaces; the second needs a heavy check on every delete.

**Schedules run as the last publisher** (`schedule_user_id`, stored pause with resume on
republish). Resumable after the author is gone, but a new column and backfill. Rejected for the
computed rule.

**Org owner fallback for schedules** (v2). Runs work under a user who never chose to, and is
impossible for personal workspaces.

**Composite FK from `workspace_members` to `members`.** Needs `organization_id` on the row and a
`NO ACTION` FK beside the user cascade, which is trigger-order dependent.

**Rely on the media sweep cron for remove-user cleanup.** Doesn't work: the sweep only sees
existing media rows, and the user delete cascades them away (section 7).

**A bucket-listing orphan sweep** (list R2 objects, delete those without a media row). Would
catch every orphan, including leftovers of a failed workspace delete. Needs a full bucket
listing per run (R2 request cost) and an age window for in-flight uploads. A feature of its
own, not v3.

## Docs to update when built

- `specs/organizations/v2-prd.md`: link to this PRD from Non-goals.
- `specs/workspaces/workspaces.md`: visibility, workspace roles, personal workspaces, glossary.
- `specs/api-standards/prd.md`: access boundary per visibility.
- `specs/workflow/workflows-scheduling.md`: author-or-pause replaces the org owner fallback.
- `specs/overview.md`: workspace visibility.
- `apps/docs`: workspaces page for users and self-hosters.

## Rollout

One PR, one agent per slice, one commit per slice. TDD in every slice.

```text
                          ┌── S2 Workspace API ──┐
S0 Naming ── S1 Access ───┤                      ├── S4 Web
                          └── S3 Schedules+purge ┘
```

S0 touches most org files, so it runs alone first. S1 owns the only migration. S2 and S3 run in
parallel; neither generates a migration.

### S0 Naming

- Section 0. No migration, no behaviour change.

### S1 Access

- Schema, `relations.ts`, migration `workspace_visibility` with the scratch check.
- `getWorkspaceAccess` and `listAccessibleWorkspaces`; guard sets `workspaceRole`.
- Sign-up and invitee personal workspaces.
- Consumers: channel, WS per-message check, MCP lookup, MCP connect, email attachments.
- `GET /workspace` returns the accessible list.

### S2 Workspace API

- `POST`, `PATCH`, `DELETE /workspace` per section 4.
- `workspace-member.controller.ts` and service.
- `GET /organization/workspaces`.

### S3 Schedules and purge

- `resolveScheduledRunUserId` with the access predicate, tick skip, `schedulePaused`.
- Personal workspace R2 cleanup in the user purge and `prepareUserRemoval`.

### S4 Web

- Section 9. Docs update.

### S5 Private workspace backfill (amendment 1)

- Migration `private_workspace_backfill` (section 8) with the scratch checks.
- Upgrade notes in the PR and the docs: existing users get a private workspace.
- Flip this PRD to `implemented`.
