# Tasks: agent runs phase 2, feedback, notifications, proposed subtasks (PRD)

> **Status: proposed** (2026-11-20). Issue #456. Extends #455
> ([PRD](../455-agent-runs/prd.md)).

Phase 1 lets a user start the assigned agent on a task. The agent reports back with a comment and
hands the task over for review. This phase closes three gaps. Users can answer the agent and run
it again. The user who started a run hears when it ends. And the agent can break a task down into
subtasks, which stay locked until a user accepts them.

Design: [design.md](./design.md).

## Problem

- **No iteration.** After a run, a user who wants changes can only start it again. The agent
  doesn't see what they think of its result. In chat they would just reply.
- **No signal.** Runs take minutes. Without a notification, users keep checking the board.
- **No planning.** A run can't create tasks in phase 1, so a broad task gets one big answer
  instead of a plan the team can pick up step by step. An agent creating tasks freely would fill
  the board without anyone deciding.

## Goals

- Users iterate on a task with the agent through comments, like in a chat, with the history on
  the task.
- An agent can propose a plan as subtasks. Nothing it proposes becomes work without a user.
- **Success signal:** a share of proposed subtasks gets accepted rather than discarded.

## Non-goals

- Agents running proposed subtasks. Starting a run stays human (#455).
- Approval for tasks an agent creates in chat. The user is present and asked for them.
- WebSocket push for run status. Polling stays.

## User stories

Roles: workspace manager, workspace editor. "User" is either of them.

### US-1 Run again with feedback (P1)

As a user, I want to answer the agent and run it again, so that I can iterate like in a chat.

- **US-1.1** Given a task with a finished run and newer user comments, when a user starts it
  again, then the agent sees its previous result and those comments.
- **US-1.2** Given a task where the agent asked a question, when a user answers in a comment and
  starts it again, then the agent continues with the answer.
- **US-1.3** Given comments a user wrote before the last run started, when a user starts it again,
  then the agent doesn't get them a second time as new feedback.

### US-2 Notify when done (P1)

As the user who started a run, I want a notification when it ends, so that I don't have to check.

- **US-2.1** Given a run a user started, when it completes, fails or asks a question, then that
  user gets a notification linking to the task.
- **US-2.2** Given a run a user stopped, then no notification is sent.

### US-3 The agent proposes subtasks (P2)

As a user, I want the agent to propose subtasks that stay locked until I accept them, so that it
can break work down without adding work to the board on its own.

- **US-3.1** Given a run, when the agent creates a subtask of its task, then it appears under the
  task in **Backlog**, locked and marked as proposed by the agent.
- **US-3.2** Given a proposed task, when a user accepts it, then it is unlocked, keeps its status,
  and shows who accepted it and when.
- **US-3.3** Given a task with several proposed subtasks, when a user accepts all of them, then
  each is unlocked as in US-3.2.
- **US-3.4** Given a proposed task, when a user discards it, then it is deleted.
- **US-3.5** Given a proposed task, when a user tries to move it to another status, assign it or
  start a run on it, then nothing changes and they are asked to accept it first.
- **US-3.6** Given a proposed task, when any agent, in chat or in a run, tries to move, assign,
  accept or set a reminder on it, then nothing changes and the agent is told why.
- **US-3.7** Given a run, when the agent tries to create a task that isn't a subtask of its task,
  then nothing is created and the agent is told why.
- **US-3.8** Rule: a run proposes at most 10 subtasks.

## Testing

| Criterion              | Level            | Folder                                          |
| ---------------------- | ---------------- | ----------------------------------------------- |
| US-1.1 to US-1.3       | worker           | `apps/worker/test/task/`                        |
| US-2.1, US-2.2         | worker           | `apps/worker/test/task/`                        |
| US-3.1, US-3.7, US-3.8 | worker           | `apps/worker/test/task/`                        |
| US-3.2 to US-3.5       | API              | `apps/api/test/task/`                           |
| US-3.6                 | API and worker   | `apps/api/test/task/`, `apps/worker/test/task/` |
| US-3.5 (drag)          | e2e (Playwright) | `apps/web/e2e/`                                 |

## Standards checklist

- **Deletion:** discarding a proposed task is the existing task delete. Proposed tasks go with
  their parent task like any subtask.
- **Retention:** nothing new.
- **Erasure:** `accepted_by_user_id` is cleared by user purge, like other user references.
- **Docs:** `apps/docs/src/content/docs/content/tasks.mdx`, the "Agents on tasks" section from
  phase 1.

## Decisions

**Work an agent proposes is locked until a human accepts it.** In a run, an agent can only
propose subtasks of its own task. A proposed task is locked: nobody can move, assign or start it,
and no agent can accept it. The lock is a mark on the task, enforced where every task write passes,
because a status like Backlog is no gate: agents can move tasks. **Accept** is an explicit action
that only removes the lock and keeps the status, so planning (by a person or a later lead agent)
stays separate from approving. Lost: accept-by-dragging, accept-moves-to-Todo, and a "pending"
status that every list and filter would have to handle.

## Open questions

None.
