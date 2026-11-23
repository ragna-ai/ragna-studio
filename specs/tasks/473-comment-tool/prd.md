# Agent tools: comment on a task (PRD)

> **Status: proposed** (2026-11-23). Issue #473. Extends #470. Prerequisite for #455.

Agents can create, update and move tasks, but they can't comment on one. Task comments (#470)
allow agent authors, yet nothing writes them. This PRD adds the agent tool `addTaskComment` and
one shared write path for every comment author.

Chat is the first consumer: "summarise this discussion as a comment on TSK-12". Agent task runs
(#455) are the second. They bind the same tool to the task under run and build on this PR.

## Problem

- A chat result that belongs to a task has to be copied over by hand.
- The 100-comment cap and the comment write path live in `apps/api`. The worker runs #455's
  agents and can't reach them, so a second writer would need a second copy of the cap.

## Goals

- A user asks an agent in chat to comment on a task, and the comment lands there.
- Every writer (API, chat tool, run tool) respects the same limits.
- **Success signal:** #455 adds its run binding without changing the chat path or the write path.

## Non-goals

- The run binding: task under run only, at most 5 comments per run, the link to the run (#455).
- `finishTaskRun` and the result and failure comments the runner writes (#455).
- Comments as run feedback (#456). Mentions and notifications.
- An approval policy for unattended runs (#281).

## User stories

Roles: workspace editor, workspace manager.

### US-1 Agent comments from chat (P1)

As a workspace editor, I want to ask an agent in chat to comment on a task, so that a result
from the conversation stays with the work it belongs to.

- **US-1.1** Given an agent with the Tasks tool, when a user in chat asks it to comment on a task
  in the workspace, then the comment appears last on that task with the agent as author, without
  an approval step.
- **US-1.2** Given a comment the agent wrote, when any user edits it, then the request is rejected
  with `409`, type `task-comment-not-editable`.
- **US-1.3** Given a task id that doesn't exist in the chat's workspace, when the agent comments,
  then the tool returns a not-found failure and no comment is written.
- **US-1.4** Given an empty comment or one over 10,000 characters, when the agent comments, then
  the call is rejected as invalid input and no comment is written.
- **US-1.5** Given an agent without the Tasks tool, when it chats, then it can't comment.

### US-2 One limit for every writer (P1)

As a workspace manager, I want the comment cap to hold whoever writes, so that a task never
grows past what the task page can load.

- **US-2.1** Given a task with 100 comments, when an agent comments, then the tool returns a
  failure saying the task is full and no comment is written.
- **US-2.2** Given a task with 99 user comments and 1 agent comment, when a user posts a comment,
  then the request is rejected with `409`, type `task-comment-limit-reached`.
- **US-2.3** Given a task with 99 comments, when a user and an agent comment at the same time,
  then exactly one comment is written.

## Testing

| Criterion        | Level | Folder                 |
| ---------------- | ----- | ---------------------- |
| US-1.1 to US-1.4 | API   | `apps/api/test/task/`  |
| US-1.5           | API   | `apps/api/test/agent/` |
| US-2.1 to US-2.3 | API   | `apps/api/test/task/`  |

Tool tests call the tool through `buildAgentToolset`, like the other task tool tests. #470's
`task-comments.test.ts` stays green unchanged.

## Standards checklist

- **Deletion:** no change. Agent comments are deleted like other comments (#470).
- **Retention:** n/a.
- **Erasure:** no change. An agent comment holds no user id. Organization purge removes it with
  the workspace.
- **Docs:** `apps/docs/src/content/docs/agents/tools.mdx` (Tasks row) and
  `apps/docs/src/content/docs/content/tasks.mdx` (agents section).

## Decisions

- **A chat comment's author is the agent, not the user who asked.** The text comes from the
  model, so it is shown as the agent's and stays read-only, like a run comment. Writing it as
  the user would put model text under a person's name. A "via chat by X" marker lost: it needs
  a new user reference on every comment (schema, purge, UI) for an audit need nobody has raised.
  Existing comments can't be re-attributed later, which makes this hard to reverse.
- **The cap lives in the repository, not in the API service.** Comments are written from the
  API and the worker. Only the repository is shared by both, and it already holds the task row
  lock that makes the count race-free.

## Design

### Write path (`@repo/database`, `task-comment.repo.ts`)

- `createUserTaskComment` becomes `createTaskComment({ workspaceId, taskId, author, body })`
  with `author: TaskCommentAuthor`, a union of `{ kind: 'user'; userId }` and
  `{ kind: 'agent'; agentId }`. Same transaction and task row lock as today.
- `MAX_COMMENTS_PER_TASK` (100) and `MAX_TASK_COMMENT_BODY_LENGTH` (10,000) are exported from the
  repo. The `maxComments` parameter goes. The API validation schema uses the body constant.
- The API service keeps permissions and HTTP mapping. Its `createTaskComment` is renamed
  `createTaskCommentForUser` (same pattern as `createTaskForUser`), so it doesn't shadow the
  repo function.

### Tool (`@repo/ai`, `task.tools.ts`)

- `addTaskCommentDefinition({ agentId })`, `access: 'write'`, returned by `taskToolDefinitions`.
  No approval: like `createTask`, it is an internal write a workspace manager can undo.
- Input (flat `z.object`): `taskId`, `body` (1 to 10,000 characters, markdown).
- Output: `{ comment: { id, taskId, displayId } }`. Failures: `not_found`, `limit_reached`.
- A task in another workspace is `not_found`, the same as a missing one.

### Extension point for #455

The axis is the binding: chat (any task in the workspace) or a run (one task, linked to the
run). #455 adds an optional `run: { taskId, taskRunId }` to the definition's options and a
`taskRunId` to `createTaskComment`. `taskRunToolDefinitions` passes `run`; chat passes nothing,
so the chat path stays as built here. Tests fake nothing: tools run against the test database.
