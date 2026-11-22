# Agent lock: lock an agent and approve it for unattended runs (PRD)

> **Status: proposed** (2026-11-22). Issue #462. Prerequisite for #455.

Anyone who can edit an agent can change it at any time, also while it is in use. That is fine
when a person watches the chat. It is not fine when the agent works alone. This PRD lets users
lock an agent's configuration, and lets a workspace manager approve that locked configuration for
unattended runs. The approval records who is responsible and pins what they approved.

## Problem

- Agents can be edited while in use. Workflows reload the agent for every step, so an edit
  changes a workflow run halfway through.
- #455 lets agents work assigned tasks with nobody watching. Someone must decide that an agent
  may do that, and stand behind the exact configuration that runs.
- Today nothing answers "which configuration produced this result".

## Goals

- A team can freeze a well-tuned agent so nobody breaks it by accident.
- A workspace manager approves an agent for unattended runs with informed consent, and the
  approval names who gave it and for which configuration.
- #455 can refuse runs of unapproved agents and record the version each run used.
- **Success signal:** every task run in #455 points at an approved version.

## Non-goals

- Change history of every edit with diffs. That is the change-event outbox on #171.
- A diff between versions in the UI. Follow-up issue.
- Workflows requiring approval, or pinning a version per workflow run. Follow-up issue with a
  migration path for scheduled workflows.
- Pinning the content of knowledge files. A version pins which files, not what they hold after
  an unlock (see Decisions).
- "Stop runs and unlock" and the active-run check on unlock ship with #455, which adds runs.

## User stories

Roles: workspace editor, workspace manager, organization owner or admin. "Manager and up" means
a workspace manager, organization owner or organization admin.

### US-1 Lock an agent (P1)

As a workspace editor, I want to lock an agent's configuration, so that nobody changes a
well-tuned agent by accident.

- **US-1.1** Given a workspace editor and an unlocked agent, when they lock it, then the agent
  shows as locked by them with the next version number.
- **US-1.2** Given a locked agent, when anyone changes its model, system prompt, context, tool
  grants, default dataset, settings or knowledge files, then the change is refused with `409`.
- **US-1.3** Given a locked agent, when an editor changes its name, description or mark, then
  the change is saved.
- **US-1.4** Given an agent with a knowledge file that is still processing or failed, when an
  editor locks it, then the lock is refused with `409`.
- **US-1.5** Given a locked agent, when a user chats with it, then it answers as usual.

### US-2 Approve for unattended runs (P1)

As a workspace manager, I want to approve an agent for unattended runs, so that it can work
without anyone watching and it is clear who answers for it.

- **US-2.1** Given a manager and up and an unlocked agent, when they approve it, then it is
  locked and approved by them in one step.
- **US-2.2** Given a locked agent that is not approved, when a manager and up approves it, then
  its current version is approved and no new version is created.
- **US-2.3** Given a workspace editor, when they try to approve an agent, then the request is
  refused with `403`.
- **US-2.4** Given a manager about to approve, when the confirmation opens, then it lists what
  the agent can write to and read from, says that knowledge files and data can change without a
  new approval, and says they are responsible for its unattended runs.

### US-3 Revoke the approval (P1)

As a workspace manager, I want to revoke an approval and keep the lock, so that I can stop
unattended runs without opening the configuration for edits.

- **US-3.1** Given an approved agent, when the approver or a manager and up revokes it, then the
  agent is no longer approved and stays locked.
- **US-3.2** Given a workspace editor who did not approve it, when they try to revoke, then the
  request is refused with `403`.

### US-4 Unlock an agent (P1)

As the user who locked an agent, I want to unlock it, so that I can fix its configuration after
it misbehaved.

- **US-4.1** Given a locked agent, when the user who locked it or a manager and up unlocks it,
  then it can be edited again and it has no approved version.
- **US-4.2** Given a workspace editor who did not lock it, when they try to unlock, then the
  request is refused with `403`.
- **US-4.3** Given an agent used by workflows or assigned to tasks, when a user unlocks it, then
  the confirmation shows how many before they confirm.
- **US-4.4** Given an unlocked agent that was approved before, when it is locked again, then the
  new version is not approved, and the old version still shows who approved it.
- **US-4.5** Rule: unlock is refused with `409` while unattended runs of the agent are active.
  Built in #455.

### US-5 Version history (P2)

As a workspace manager, I want to see an agent's versions, so that I know who locked and
approved which configuration and when.

- **US-5.1** Given an agent locked three times, when a user opens its versions, then they see
  three entries, newest first, each with who locked it, who approved it and when.
- **US-5.2** Given an agent that was never locked, when a user opens its versions, then they see
  an empty state.

### US-6 Delete a locked agent (P1)

As a workspace manager, I want a locked agent to survive a stray delete, so that approved work
doesn't vanish without someone unlocking it first.

- **US-6.1** Given a locked agent, when anyone deletes it, then the request is refused with
  `409` and the message says to unlock it first.
- **US-6.2** Rule: deleting an unlocked agent keeps its versions, so past runs still show the
  configuration they used under "Deleted agent".

## Testing

| Criterion                                     | Level            | Folder                 |
| --------------------------------------------- | ---------------- | ---------------------- |
| US-1.x, US-2.1 to 2.3, US-3.x, US-5.x, US-6.x | API              | `apps/api/test/agent/` |
| US-4.1 to US-4.4                              | API              | `apps/api/test/agent/` |
| US-2.4, US-4.3 (dialog)                       | e2e (Playwright) | `apps/web/e2e/`        |
| US-4.5                                        | API, in #455     | `apps/api/test/task/`  |

## Standards checklist

- **Deletion:** hard delete. A locked agent can't be deleted (US-6.1). Versions are not deleted
  with their agent; they go with their workspace. `agent_versions` gets the `deleted_record`
  trigger once that standard is implemented.
- **Retention:** versions are kept as long as their workspace. No expiry: runs reference them.
- **Erasure:** versions hold user ids (locked by, approved by). User purge nulls them, like other
  authorship columns.
- **Docs:** `apps/docs/src/content/docs/agents/index.mdx` gets a "Lock and approve" section.

## Decisions

**Unlock waits for running work.** Unlock is refused while unattended runs are active (US-4.5).
A run never sees its configuration change. The issue first allowed unlocking during runs; that
needed copies of every knowledge file for runs in flight. The user stops the runs first, which
#455 offers in the same dialog.

**Approvals stay on their version.** Unlock doesn't clear an approval. The old version keeps
who approved it, because the runs that used it happened under that approval. The agent has no
current version after unlock, so nothing runs on the old approval.

**Knowledge files by id only.** A version stores the ids of its knowledge files, not their
content or a hash. Knowledge files are expected to become a tool-based knowledge base, read
like other data. Then the version pins the grant, not the content. The approval dialog says
so (US-2.4).

## Design

See [design.md](./design.md).
