# Tasks: agent runs phase 2 (design)

> Issue #456. Requirements: [prd.md](./prd.md). Story IDs below refer to it. Builds on the
> [phase 1 design](../455-agent-runs/design.md): `task_runs`, `task_comment`, the runner and the
> tool policy.

## Feedback in the prompt (US-1)

The prompt gains a third block after `<previous_runs>`:

```text
<comments> user comments created after the last run started, oldest first </comments>
```

"After the last run started" uses `task_runs.created_at` of the newest earlier run, so comments
already seen are not repeated (US-1.3). Agent comments are left out: they are already in
`<previous_runs>`. Like the task text, comments are untrusted content.

The comment block is capped at about 8,000 characters, newest kept. Longer feedback belongs in
the task description.

## Notifications (US-2)

On `succeeded` or `failed` the processor enqueues `NOTIFY_USER_JOB` for `started_by_user_id`
with a new notification type `task-run-finished` (`{ taskId, taskRunId, outcome }`). Canceled
runs send nothing: the user who stopped it knows (US-2.2). The processor checks
the user's workspace access first and skips the notification if it is gone.

**Not-started reminder (US-2.3).** `listTasksDueForReminder` also returns whether the task has an
assigned agent and no `task_runs` row, in the same query (a `not exists` subquery, no per-task
lookup). The reminder notification then carries the agent's name and reads "Assigned to <agent>,
not started yet". The recipient stays as today until #181.

## Proposal lock (US-3)

`task` gains three columns:

| Column                    | Type       | Notes                                                |
| ------------------------- | ---------- | ---------------------------------------------------- |
| `proposed_by_task_run_id` | text?      | FK → `task_runs.id`, set null. Which run proposed it |
| `accepted_by_user_id`     | text?      | FK → `user.id`, set null                             |
| `accepted_at`             | timestamp? | Null on a proposed task means locked                 |

Locked = `proposed_by_task_run_id is not null and accepted_at is null`.

**Where the lock is enforced.** In the shared task write path in `@repo/database`, which both the
api service and the task tools call. For a locked task it refuses a change of status, assignee or
reminder from any caller, and lets only `origin: 'user'` accept. Title and description stay
editable, so a user can refine a proposal before accepting it, and the proposing run can refine
its own plan. A new task tool inherits the lock without extra code. Starting a run on a locked
task is refused by the start checks (`409 task-locked`).

**Creating proposals.** In a run, `createTask` gets the run's context (`taskRunId`, `taskId`) and
only creates subtasks of the run's task, in `backlog`, with `proposed_by_task_run_id` set. It
replaces phase 1's refusal. The cap is 10 per run, counted by `proposed_by_task_run_id` (US-3.8).
Due date and reminder inputs are dropped with a note in the tool result: due dates are
planning metadata for people (phase 1, US-1.6), so the reviewer sets them (US-3.9).
If the run's task is itself a subtask, `createTask` returns a tool failure (subtasks are one level
deep) and the agent lists its steps in the summary instead.

**API.**

| Route                   | Does                                                |
| ----------------------- | --------------------------------------------------- |
| `POST /task/:id/accept` | Accept one (US-3.2)                                 |
| `POST /task/accept`     | Accept several, body `{ taskIds }`, max 10 (US-3.3) |

Discard is the existing `DELETE /task/:id` (US-3.4). Accept is idempotent: accepting an accepted
task returns it unchanged.

**Web.** A locked card shows a lock and "Proposed by <agent>". It can't be dragged to another
column; the tooltip asks to accept it first (US-3.5). The parent task shows "Accept all" and
"Review each" when it has proposed subtasks.

## Loop safety

Accepting is the second human gate next to starting a run. Proposals are one level deep. Accepted
tasks behave like any task: agents may move and assign them, which is planning, while starting a
run stays human. The rule for future automatic triggers in the phase 1 design still applies.

## Slices (outline)

1. Database: lock columns, lock check in the task write path, accept function.
2. Worker: comments in the prompt, notification, `createTask` in runs.
3. API: accept routes, `task-locked` on start, lock errors on task writes.
4. Web: comments as feedback hint, locked card, accept and discard, accept all.
5. Docs: tasks page, glossary.
