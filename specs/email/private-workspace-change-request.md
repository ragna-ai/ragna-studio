# Email automation in the private workspace (change request)

> **Status: implemented** (PR #98, 2026-10-10). Builds on [Organizations v3](../organizations/v3-prd.md)
> and its amendment 1 (every user has a private workspace). Resolves `tbd.md` item 1 and the
> "workspace interplay" open question in [prd.md](./prd.md).

## Why

The inbox is per user (`email_accounts.user_id` is unique), but its automation points at an
agent, and agents are workspace resources. The account has no workspace, so the draft agent is
checked by authorship: `assertOwnedAgent` (`apps/api/src/services/email.service.ts`) and
`runDraftAgent` (`apps/worker/src/mail/email-draft.service.ts`) both call
`getAgentById({ agentId, userId })`, which filters on `agents.user_id`. After Organizations v2
and v3 that is wrong in three ways:

1. A user can only pick agents they authored, not shared agents of workspaces they can open.
2. A user who loses access to a restricted workspace keeps auto-drafting with an agent from it.
   The v3 access predicate is never consulted.
3. Once an agent's author is purged (`user_id` null), no account can select it.

## Decisions

| #   | Decision                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Email lives in the private workspace.** The inbox stays per user. Its automation (draft agent, auto-draft, manual "Draft with AI") runs in the user's private workspace.        |
| 2   | **Draft agents come from the private workspace only.** The lookup requires `agents.workspace_id` = the user's personal workspace, not authorship.                                 |
| 3   | **Fallback to the private workspace's default agent** when no draft agent is set or the stored one is not in the private workspace. Auto-draft keeps working without user action. |
| 4   | **Migration nulls stale `email_accounts.default_agent_id`** values that point outside the user's private workspace.                                                               |
| 5   | **The Mail nav item shows only while the private workspace is active.**                                                                                                           |
| 6   | **`/mail` outside the private workspace shows a hint page** with a "Switch to your private workspace" button. No automatic switch.                                                |
| 7   | **Compose attachments come from the private workspace only.** Media of shared workspaces must be copied there first. Replaces v3's "any accessible workspace" for email.          |

## Design

### Agent resolution

- Replace `getAgentById({ agentId, userId })` for email with a lookup in the user's private
  workspace: `getPersonalWorkspaceIdByUserId` then `getAgentByIdAndWorkspaceId`, or one repo
  function joining both. One query.
- Resolution order for a draft run: per-use override (manual trigger) if it is in the private
  workspace, else `default_agent_id` if it is in the private workspace, else the private
  workspace's default agent (`getOrCreateDefaultAgentForWorkspace`).
- `assertOwnedAgent` becomes "agent is in the caller's private workspace". Setting a draft agent
  outside it returns 404, like any foreign reference.
- The agent picker in mail settings lists the private workspace's agents only.
- Remove `getAgentById` if no caller remains (the workflow executors use their own lookups;
  verify).

### Migration

`--custom` migration `email_default_agent_private_only`: set `default_agent_id = NULL` where
the agent's `workspace_id` is not the account user's personal workspace, with a row-count
notice. Needs Organizations v3 amendment 1 (the backfill) to have run first, so it ships after
PR #97. `email_drafts.agent_id` stays as history and is not touched.

### Web

- Nav: Mail only when the active workspace's `visibility` is `personal`.
- `/mail/**`: when the active workspace isn't personal, render a hint page ("Mail lives in your
  private workspace") with a button that selects the private workspace from the workspace list.
- Compose media picker: private workspace media only.

### API

- Compose and send: `mediaIds` must belong to the private workspace (replaces the accessible-list
  check from v3 S1 in `email.service.ts`). Foreign media returns the existing rejection.

### Tests (TDD)

- Settings: picking an agent from a shared workspace is rejected; from the private workspace
  accepted.
- Draft run: stale `default_agent_id` falls back to the private workspace's default agent;
  override outside the private workspace is ignored or rejected (match the manual route's
  contract).
- Attachments: media from a shared workspace rejected, from the private workspace accepted.
- Migration: scratch check that stale ids are nulled and valid ones kept.

## Considered

**Automation workspace picker** (account setting, default private). More flexible, but adds a
"lost access" state and lets mail content flow into workspaces org owners and org admins can
open.

**Workspace inboxes** (team mailbox owned by a workspace). A product of its own: shared tokens,
per-user read state, assignment, sending identity. Separate PRD if a real need appears.

**Automatic switch to the private workspace on `/mail`.** One click less, but silently changes
the active workspace from a link. Rejected for the explicit hint page.

**Attachments from any accessible workspace.** Convenient for shared assets, but breaks "mail
lives in the private workspace".

## Rollout

After PR #97 is merged. One PR, slices: API + migration, worker draft resolution, web.
