# Task Attachments (PRD)

> **Status: implemented** (2026-09-02, verified and confirmed by the user).
> Built by two parallel Sonnet subagents (backend: schema/relations/refcount/
> repo/API; web: composable/mutations/chip UI/page wiring). Notable
> deviations from spec during the build: the GET list endpoint
> (`GET /workspace/:workspaceId/task/:taskId/attachments`) wasn't in the
> original API section below and had to be added after an integration pass
> caught the frontend expecting it; `TaskAttachmentResponse.url` always
> points at the private download route for every kind (chat branches images
> to a public CDN url for inline rendering, but task attachments have no
> inline-render requirement so this was simplified); `TaskAttachments.vue`
> takes only a `task-id` prop and derives the workspace id internally via
> `useActiveWorkspaceId()`, matching existing task composable convention
> rather than the `workspace-id` prop sketched below; file-type icons
> (`vscode-icons:file-type-*`, keyed by extension) were added after initial
> confirmation to replace the generic file icon in both chip components.

Adds file attachments to tasks, reusing the `@repo/media` core already
built for [chat attachments](../media-library/prd.md) (media table +
refcount deletion + sweep cron). No new architecture: `task_attachments` is
a link table shaped exactly like `chat_attachments`.

## Decisions

Settled 2026-09-02. Do not re-open.

| Decision           | Choice                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Scope**           | Files only. No text extraction, no agent visibility into attachment contents. Attachments are for humans, downloadable, not part of task/agent context. |
| **UI placement**    | New "Attachments" section on the task detail page (`/tasks/:taskId`), similar weight to `TaskSubtaskList`, below the description editor. |
| **Subtask support** | Both top-level tasks and subtasks can have attachments. No schema difference (`task_attachments.taskId` works for either); pure UI decision to expose the section on subtask detail views too. |

## Design (mirrors chat attachments)

**Database** (`packages/database/src/schema/task.schema.ts`):

- New `task_attachments` table: `id`, `taskId` (FK → `tasks.id`, `onDelete: 'cascade'`), `mediaId` (FK → `media.id`, no delete action — a media row must never be deleted while an attachment points at it), `createdAt`. Indexes on `taskId` and `mediaId`.
- Register in `relations.ts`: `taskAttachment` table entry, `task.attachments: r.many.taskAttachment()`, `media.taskAttachments: r.many.taskAttachment()`.

**Refcount wiring** (`packages/database/src/repositories/media.repo.ts`):

- Add `taskAttachment` to `countMediaReferences` and `findUnreferencedMediaOlderThan` — both currently enumerate every link table by hand. Skipping this leaks orphaned R2 objects (media rows the sweep can never see as unreferenced).

**Repo** (`packages/database/src/repositories/task.repo.ts`):

- `createTaskAttachment`, `deleteTaskAttachmentById`, `getTaskAttachmentById`, `getTaskAttachmentsByTaskId` — same shape as the `chat_attachments` repo functions.

**API** (`apps/api`):

- `POST /workspace/:workspaceId/task/:taskId/attachments` (multipart `files`), `DELETE /workspace/:workspaceId/task/:taskId/attachments/:attachmentId`, mirroring `uploadChatAttachments`/`removeChatAttachment` in `apps/api/src/services/media.service.ts`.
- Reuses `@repo/media`: `sniffMediaKind` for validation, `storeMedia` for upload, `deleteMediaIfUnreferenced` on delete. No `extractText` call (files-only decision above).
- Same all-or-nothing validation and size cap pattern as chat attachments (10MB/file), no new limits decided yet — reuse the existing constant unless the user wants a different cap for tasks.
- Download reuses the existing `GET /workspace/:workspaceId/media/:mediaId/download` route (owner-agnostic already).

**Web** (`apps/web/app/features/task/`):

- New `useTaskAttachments.ts` composable, ported from `useChatAttachments.ts` (pending/uploading/error state), plus `useUploadTaskAttachment`/`useDeleteTaskAttachment` mutations in `useTaskApi.ts`.
- New `TaskAttachments.vue` component (file chip grid, reusing the chip visuals from `ChatPendingAttachment.vue`), added to `app/pages/tasks/[taskId]/index.vue` below the description editor.
- No changes needed to `TaskPropertiesSidebar.vue`.

## Out of scope (v1)

- Agent/AI visibility into attachment contents (text extraction).
- Attachment previews/thumbnails beyond what the existing chip component already does for images.
- Per-task or per-workspace attachment size/count quotas beyond the existing 10MB/file cap.
