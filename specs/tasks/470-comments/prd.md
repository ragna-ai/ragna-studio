# Tasks: comments (PRD)

> **Status: proposed** (2026-11-23). Issue #470. Prerequisite for #455.

Tasks have no comments. People discuss a task in chat or elsewhere, away from the work. This PRD
adds comments to the task detail view: users write them in markdown, and the data model already
allows agents as authors.

Agent task runs (#455) are the first agent author. A run reports its result, its question or its
failure as a comment, and phase 2 (#456) feeds user comments back into the next run. This PR
builds no agent writer.

## Problem

- The task detail view has a description and attachments, but no place to discuss the task.
- #455 needs a place to show what a run produced, next to the task it worked on.

## Goals

- Users discuss a task on the task itself.
- Agent comments are a fixed record of what a run produced.
- **Success signal:** #455 writes its run results as task comments without a schema change
  beyond its `task_run_id` column.

## Non-goals

- Mentions, reactions, threads and attachments in comments.
- Notifications on new comments and realtime updates.
- A comment count on the board card or list row. It needs a design first.
- An agent tool to comment. A chat agent writing without supervision needs its own decision.
- Pagination. A task holds at most 100 comments until the pagination standard (#173) exists.

## User stories

Roles: workspace editor, workspace manager. Every user with workspace access holds one of the two.

### US-1 Comment on a task (P1)

As a workspace editor, I want to comment on a task, so that the discussion stays with the work.

- **US-1.1** Given a workspace editor on a task, when they post a comment, then it appears last
  in the list with their name and the time.
- **US-1.2** Given a task with comments, when a user opens it, then the comments show oldest
  first with their markdown formatting.
- **US-1.3** Given an empty comment or one over 10,000 characters, when it is posted, then the
  request is rejected with `422` and the user sees the translated "check your input" message.
- **US-1.4** Given a task with 100 comments, when a user posts another, then the request is
  rejected with `409`, type `task-comment-limit-reached`, and the user sees a translated message.
- **US-1.5** Given a user with no access to the workspace, when they read or post comments on
  one of its tasks, then the request is denied like any other request into that workspace.

### US-2 Edit and delete comments (P1)

As a workspace editor, I want to fix or remove my own comments, so that a typo or a wrong
statement doesn't stay on the task.

- **US-2.1** Given their own comment, when a user edits it, then everyone sees the new text
  marked "edited".
- **US-2.2** Given another user's comment, when a workspace editor edits or deletes it, then the
  request is rejected with `403`.
- **US-2.3** Given their own comment, when a user deletes it, then it is gone for everyone.
- **US-2.4** Given any comment, when a workspace manager deletes it, then it is gone for everyone.
- **US-2.5** Given a comment that no longer exists, when a user edits or deletes it, then the
  request is rejected with `404`.

### US-3 Agent comments are a fixed record (P1)

As a workspace manager, I want agent comments to stay as the agent wrote them, so that the run
history can be trusted.

- **US-3.1** Given an agent comment, when a user opens the task, then it shows the agent's name
  and mark.
- **US-3.2** Given an agent comment, when anyone edits it, then the request is rejected with
  `409`, type `task-comment-not-editable`.
- **US-3.3** Given a comment whose author was deleted, when a user opens the task, then it shows
  "Deleted user" or "Deleted agent" and keeps its text.

## Testing

| Criterion                           | Level            | Folder                |
| ----------------------------------- | ---------------- | --------------------- |
| US-1.1 (API part), US-1.2 to US-1.5 | API              | `apps/api/test/task/` |
| US-2.1 to US-2.5                    | API              | `apps/api/test/task/` |
| US-3.1 to US-3.3                    | API              | `apps/api/test/task/` |
| US-1.1 journey: post, then see it   | e2e (Playwright) | `apps/web/e2e/`       |
| Agent mark, "edited" label          | visual review    |                       |

Agent comments are inserted by a test fixture: no API route writes them in this PR.

## Standards checklist

- **Deletion:** hard delete. A comment is user-written content, so `task_comments` joins the
  `deleted_record` trigger list once the deletion standard is implemented. Deleting a task
  cascades its comments. No side effects to stop.
- **Retention:** n/a.
- **Erasure:** user purge sets `author_user_id` to null and keeps the text, like task authorship.
  Comments are workspace content. Organization purge removes them with the workspace.
- **Docs:** `apps/docs/src/content/docs/content/tasks.mdx` gets a Comments section. Two new
  error pages under `apps/docs/src/content/docs/errors/`.

## Decisions

- **`author_kind` column instead of inferring the type from which id is set.** Purge and agent
  deletion set the id to null, and the UI must still say "Deleted user" or "Deleted agent". A
  check constraint ties the ids to the kind. The alternative (both ids null means "unknown
  author") loses that and can't be recovered later.
- **Cap of 100 comments per task instead of pagination.** The pagination standard (#173) isn't
  written. A cap keeps `GET` bounded (worst case about 1 MB) without guessing that standard's
  shape. Raising the cap or adding pagination later is not a breaking change for clients that
  read the whole list.

The schema, API and web changes are in [design.md](./design.md).
