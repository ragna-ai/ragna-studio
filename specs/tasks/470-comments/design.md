# Tasks: comments (design)

> Design for [prd.md](./prd.md). Issue #470.

## Schema

New table `task_comments` in `task.schema.ts`, registered in `relations.ts` (task, workspace,
user, agent).

| Column                     | Type and rule                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `id`                       | primary id                                                                             |
| `workspace_id`             | not null; composite FK `(workspace_id, task_id)` → `tasks`, cascade                    |
| `task_id`                  | not null                                                                               |
| `author_kind`              | pg enum `task_comment_author_kind`: `user`, `agent`                                    |
| `author_user_id`           | FK → user, set null                                                                    |
| `author_agent_id`          | composite FK `(workspace_id, author_agent_id)` → agents, set null on `author_agent_id` |
| `body`                     | text, not null. Length 1 to 10,000 checked by the API                                  |
| `edited_at`                | null until edited                                                                      |
| `created_at`, `updated_at` | shared `timestamps`                                                                    |

- Check: `author_kind = 'user'` implies `author_agent_id IS NULL`, `author_kind = 'agent'`
  implies `author_user_id IS NULL`.
- Index on `(task_id, created_at)`.
- Migration through `db:generate`. #455 adds `task_run_id` in its own migration.

## API

Under `/workspace/:workspaceId/task/:taskId/comments`, in `task.controller.ts`, logic in a new
`task-comment.service.ts`.

| Route                | Does                                                                      |
| -------------------- | ------------------------------------------------------------------------- |
| `GET /`              | All comments, oldest first                                                |
| `POST /`             | Body `{ body }`. `409 task-comment-limit-reached` at 100                  |
| `PATCH /:commentId`  | Body `{ body }`. Own user comment only: `409` for agent, `403` for others |
| `DELETE /:commentId` | Own comment, or any as workspace manager, else `403`                      |

Comment response:

```ts
{ id, taskId, body, editedAt, createdAt,
  author: { kind: 'user', id, name } | { kind: 'agent', id, name, icon, tone },
  canEdit, canDelete }
```

- `id`, `name` and the mark fields are null when the author is gone.
- No user image: the stored one is the sign-in provider's URL, which the CSP blocks and which
  would send every viewer's IP to that provider. Users show initials (`UserAvatar`), like the
  user menu.
- `canEdit` and `canDelete` are computed by the service from the same rules the routes enforce,
  so the web doesn't repeat them.
- Authors are joined in the list query: no query per comment.
- The cap is checked inside the insert transaction after locking the task row, so two parallel
  posts can't pass 100.
- New problem types `task-comment-limit-reached` and `task-comment-not-editable` in
  `@repo/api-errors`, with web i18n mappings and docs pages.

## Web

- `features/task/components/`: `TaskComments.vue` (list plus composer), `TaskCommentItem.vue`,
  `TaskCommentComposer.vue`. The composer and inline edit reuse the `@repo/editor` setup of
  `TaskDescriptionEditor.vue`.
- One composable per query or mutation (`useTaskComments`, `useCreateTaskComment`, ...).
- Agent authors show the agent mark component used elsewhere. i18n keys in `en-UK` and `de-DE`.
- Placed on the task detail page below the description and attachments.

## Glossary

Add **task comment**: a markdown note on a task, written by a user or an agent. _Avoid:_ note,
reply, message.
