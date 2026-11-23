# Tasks: agents work assigned tasks (PRD)

> **Status: proposed** (2026-11-20). Issue #455. Extends the [tasks PRD](../prd.md). Builds on
> #462 (agent lock and approval, merged in PR #463). Needs #470 (task comments) and #471 (reading
> task attachments), which both ship first.

Today a user can assign a task to an agent, but nothing happens. The assignment is a label on the
card. This PRD lets a user start the assigned agent on the task. The agent works in the background
with its agent tools, then reports back on the task and hands it to a human for review.

Design: [design.md](./design.md). Phase 2 (feedback from comments, notifications, proposed
subtasks): #456, [PRD](../456-agent-run-follow-ups/prd.md).

## Problem

Users already have two ways to get work out of an agent. Neither fits delegated work.

- **Chat** is a conversation. The user writes a prompt, waits and steers turn by turn. The result
  is a message in a private thread. Nobody else sees that the work exists, is done, or needs a
  look. Closing the tab doesn't stop it, but nothing tracks it either.
- **Workflows** are a repeatable process: the same steps on a schedule or a trigger. Building one
  for a single piece of work is too much.

A **task** is a unit of work with an owner, a status and a place on a shared board. Handing it to
an agent means:

| Chat prompt                            | Task given to an agent                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| Synchronous: the user waits            | Asynchronous: the user starts it and moves on               |
| Instructions grow over many turns      | Instructions written up front: description, files, subtasks |
| Result is a message in one user's chat | Result is on the task, visible to the whole workspace       |
| No status, no review step              | Status on the board, ends in **In Review** for a human      |
| One at a time per user                 | Several tasks run in parallel                               |
| Ephemeral                              | History: who started it, what ran, what it cost             |

The job to be done: _"I have routine work on my board (research, a first draft, filling a dataset,
sorting files). I want to hand it off like to a colleague, see it come back for review, and keep
working on other things meanwhile."_

Assumption: we have no user reports yet. The table above is the hypothesis this feature tests.
Examples of good and poor fits: [agent-run-use-cases.md](../reference/agent-run-use-cases.md).

## Goals

- A user hands a task to its assigned agent and gets the result back on the task for review.
- The whole workspace sees what agents are working on, from the board.
- A run never repeats a side effect (an email sent twice) because of a retry.
- **Success signal:** most finished task runs move to **Done** after review without a second run.

## Non-goals

- Starting a run automatically when an agent is assigned. A later setting, opt-in per workspace.
- Starting a run on a date or a schedule. Workflows own scheduling, for example a later workflow
  step that picks up tasks with a given label every Monday. It falls under the loop safety rule in
  the design.
- Agents running subtasks on their own. Subtasks are context in v1.
- Agents creating tasks during a run. Proposed subtasks come in phase 2 (#456). Chat stays as
  today: the user is present and asked for them.
- Comments as feedback for the next run, and notifications when a run ends. Phase 2 (#456).
- Pausing a run for tool approval and resuming it. Tools that need approval are refused in v1
  (#281 brings the policy).
- Live updates by WebSocket push. The open task polls its run in v1.
- People as assignees (#380).

## User stories

Roles: workspace manager, workspace editor. "User" is either of them.

### US-1 Start the agent on a task (P1)

As a user, I want to start the assigned agent on a task, so that the work happens without me
watching.

- **US-1.1** Given a task with an assigned agent, when a user starts it, then the task moves to
  **In Progress** and shows that the agent is working.
- **US-1.2** Given a task without an assigned agent, when a user assigns an agent and chooses to
  start right away, then the run starts as in US-1.1.
- **US-1.3** Given a task with a run in progress, when a user starts it again, then the request is
  rejected and the running run is unchanged.
- **US-1.4** Given a workspace whose balance is below the minimum to start, when a user starts a
  run, then it is refused with "Not enough credits" and the task keeps its status.
- **US-1.5** Given an agent changes a task's assignee with its task tools, then no run starts.
- **US-1.6** Rule: the due date is planning metadata for people. The agent doesn't get it. A date
  the work depends on belongs in the description.
- **US-1.7** Rule: the agent knows today's date.
- **US-1.8** Given a task whose assigned agent is not approved for unattended runs, when a user
  starts a run, then it is refused and the user is told the agent needs that approval (#462).

### US-2 The agent reports back (P1)

As a user, I want the agent's result on the task, so that I can review it where the work lives.

- **US-2.1** Given a run that completes, then the agent's summary appears as a comment on the
  task and the task moves to **In Review**.
- **US-2.2** Given a task that lacks information the agent needs, when the agent can't continue,
  then its question appears as a comment and the task moves back to **Todo**.
- **US-2.3** Given a run that fails, then a comment says what failed and whether some actions
  already happened, and the task returns to its status from before the run.
- **US-2.4** Given an agent whose tool needs a user's approval, when it tries that tool, then the
  action does not happen and the agent's comment names the action it needs approved.
- **US-2.5** Given a run, when the agent tries to create a task, then nothing is created and the
  agent is told to list the steps in its result instead.
- **US-2.6** Given a task whose earlier run failed after taking actions, when a user starts it
  again, then the agent is told which actions already happened.
- **US-2.7** Given an approved agent whose model, a granted tool or a tool's connection is no
  longer available, when its run starts, then it fails before taking any action and asks for the
  agent to be approved again.

### US-3 Follow and stop a run (P1)

As a user, I want to see and stop a running agent, so that I stay in control of what it does.

- **US-3.1** Given a running task, then every user of the workspace sees on the board that an
  agent works on it.
- **US-3.2** Given a running task, when a user stops it, then the agent takes no further action
  and the task returns to its status from before the run.
- **US-3.3** Given a running task, when a user deletes it or assigns another agent, then the run
  stops.
- **US-3.4** Given a finished run, when a user opens the task, then they see the run's steps,
  tool calls, duration, credits used and the agent version it ran with.
- **US-3.5** Given a running task, when a user tries to change it other than deleting it or
  assigning another agent, then nothing changes and they are told to stop the run first.
- **US-3.6** Given an agent with active task runs, when a user unlocks it, then it is refused with
  `409` and the user can choose to stop those runs and unlock. That stops every run of the agent
  as in US-3.2, then unlocks it.

### US-5 Limits (P1)

As a workspace manager, I want runs to stay bounded, so that a full board can't drain credits or
hang.

- **US-5.1** Rule: a workspace has at most 3 runs in progress. Starting one more is refused. A
  platform admin can change the number.
- **US-5.2** Rule: a run stops after 30 minutes or 30 steps and reports as failed. A platform admin
  can change both.
- **US-5.3** Given a run, when the agent calls the same tool with the same input 3 times in a
  row, then the run stops and reports that the agent was stuck.
- **US-5.4** Given a workspace with runs in progress, when a workspace manager stops all runs,
  then every run in the workspace stops as in US-3.2.
- **US-5.5** Given a workspace editor, when they try to stop all runs, then the request is
  rejected with `403`.
- **US-5.6** Given a running task, when the workspace balance falls below the allowed overshoot,
  then the run stops before its next step and reports that credits ran out. The credits it used
  are still charged.

## Testing

| Criterion                      | Level            | Folder                                          |
| ------------------------------ | ---------------- | ----------------------------------------------- |
| US-1.1, US-1.3, US-1.4, US-1.8 | API              | `apps/api/test/task/`                           |
| US-1.2                         | e2e (Playwright) | `apps/web/e2e/`                                 |
| US-1.5, US-1.6, US-1.7         | worker           | `apps/worker/test/task/`                        |
| US-2.1 to US-2.7               | worker           | `apps/worker/test/task/`                        |
| US-3.1                         | e2e (Playwright) | `apps/web/e2e/`                                 |
| US-3.2 to US-3.6               | API and worker   | `apps/api/test/task/`, `apps/worker/test/task/` |
| US-5.1                         | API              | `apps/api/test/task/`                           |
| US-5.2, US-5.3, US-5.6         | worker           | `apps/worker/test/task/`                        |
| US-5.4, US-5.5                 | API              | `apps/api/test/task/`                           |

## Standards checklist

- **Deletion:** runs and comments are deleted with their task. Deleting a task stops its run first.
  Deleting an agent keeps its past runs and comments, shown as "Deleted agent".
- **Retention:** a run's trace is kept as long as its task. No separate expiry in v1.
- **Erasure:** comments and runs reference their user. User purge removes that reference and keeps
  the text, like other workspace content.
- **Docs:** `apps/docs/src/content/docs/content/tasks.mdx` gets an "Agents on tasks" section.

## Decisions

**A human starts every run.** Assigning stays metadata, and starting is a separate action ("Assign
and start" in one step). Agents can assign tasks through their tools, and assignments happen in
bulk or by mistake. Starting on assign would spend credits on accidents and let agents start each
other in a loop. Lost: the "assign and forget" feel. A per-workspace auto-start setting can come
later on top.

**No automatic retry after a side effect.** An agent run is not idempotent: a retried run sends
the email again. The worker retries a run only while no writing tool has finished. After that a
failure is final and the user runs it again with the previous trace as context. Lost: fully
automatic recovery. Resuming from the last finished step, plus writes that can safely run twice,
come in #461. Undoing writes is ruled out: users may have edited the data, and outside actions
can't always be undone.

**Unattended runs need an approved agent.** A workspace manager or org owner or admin locks the
agent and approves it for unattended runs (#462, shipped before this PR). Locking creates an
immutable agent version and the approval belongs to that version, so a changed agent must be
approved again. A run records the version and runs on the version's configuration, not the live
agent, checked against today's models, tools and connections at start. This answers "which configuration produced this
result" and "who allowed it to run on its own" without copying the agent into every run. The task
itself is locked while its run is active; stopping the run unlocks it. Lost: a per-run snapshot of
task and agent. A full audit trail comes with the audit log standard (#171).

**The agent ends at In Review, never Done.** The run's output is a proposal. A human closes the
task. Lost: fully unattended completion for trusted routine tasks.

**A human gate breaks every loop.** Starting a run is human-only, and in phase 2 so is accepting
a task an agent proposed. Every other agent action is planning. A loop needs a cycle of automatic
triggers, and with this gate every cycle passes through a person. Lost: agents handing work to agents unattended. That
needs run lineage and budgets first (see the design's loop safety section).

## Open questions

- [NEEDS CLARIFICATION: Default for the minimum balance to start a run and for the allowed
  overshoot. Both are platform settings; they need numbers once credit pricing is seeded.]
