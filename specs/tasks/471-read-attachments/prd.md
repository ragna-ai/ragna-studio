# Agent tools: read task attachments (PRD)

> **Status: proposed** (2026-11-23). Issue #471. Prerequisite for #455.

Agents can't read task attachments. `readTask` doesn't list them, and no tool returns a file's
content, so an agent sees nothing of "contract.pdf" on a task. This PRD has the worker extract
an attachment's text after upload. `readTask` lists the attachments, and a new tool
`readTaskAttachment` returns the stored text.

Chat is the first consumer: "summarize the attachment on TSK-12". Agent task runs (#455) are
the second: "extract all deadlines from the attached contract".

## Problem

- Task attachments are stored as files only. Their upload never extracts text, unlike chat
  attachments.
- Parsing a PDF on every read would slow every agent call that reads it. During a #455 run, the
  same file can be read several times.

## Goals

- A user asks an agent about a task's attachment, and the agent answers from the file's text.
- Attachments uploaded before this ships become readable without user action.
- **Success signal:** #455 reads attachments with this tool, unchanged.

## Non-goals

- Images for vision-capable models. A later issue if needed.
- Writing or deleting attachments through agent tools.
- An attachment count in `listTasks`. `readTask` lists them.

## User stories

Roles: workspace editor.

### US-1 Agents see a task's attachments (P1)

As a workspace editor, I want an agent to know which files are attached to a task, so that it can
refer to them and choose which to read.

- **US-1.1** Given a task with two attachments, when an agent reads the task, then the result
  lists both with id, file name, mime type and size, and no content.
- **US-1.2** Given a task without attachments, when an agent reads the task, then the
  attachment list is empty.

### US-2 Agents read an attachment's text (P1)

As a workspace editor, I want an agent to read the text of a task's attachment, so that it can
work with documents I attached instead of me pasting them into chat.

- **US-2.1** Given a pdf, docx, pptx, xlsx, csv, txt or md attachment whose text was extracted,
  when an agent reads it, then it gets the text and `truncated: false`.
- **US-2.2** Given an attachment with more than 100,000 characters of text, when an agent reads
  it, then it gets the first 100,000 characters and `truncated: true`.
- **US-2.3** Given an attachment whose extraction hasn't finished, when an agent reads it, then
  the tool returns a not-ready failure that tells the agent to try again later.
- **US-2.4** Given an image attachment, a failed extraction or a file with no text, when an agent
  reads it, then the tool returns a not-readable failure naming the file.
- **US-2.5** Given an attachment of another task, or a task in another workspace, when an agent
  reads it, then the tool returns a not-found failure.

### US-3 Text is extracted after upload (P1)

As a workspace editor, I want the text extracted in the background, so that uploads stay fast
and agents read without waiting for a parse.

- **US-3.1** Given a user uploads a document to a task, when the upload returns, then the
  attachment is pending and the worker extracts its text shortly after.
- **US-3.2** Given an extraction that fails on every retry, when the last attempt ends, then the
  attachment is marked failed and is never retried.
- **US-3.3** Given a pending attachment whose job was lost, when the sweep runs, then the
  extraction is queued again.
- **US-3.4** Given a document attached before this release, when the release is deployed, then
  its text is extracted without user action.

## Testing

| Criterion        | Level  | Folder                                         |
| ---------------- | ------ | ---------------------------------------------- |
| US-1.1, US-1.2   | API    | `apps/api/test/task/`                          |
| US-2.1 to US-2.5 | API    | `apps/api/test/task/`                          |
| US-3.1           | API    | `apps/api/test/task/` (job enqueued)           |
| US-3.2, US-3.3   | worker | `apps/worker/test/`                            |
| US-3.4           | API    | `apps/api/test/database/` (migration backfill) |

Tool tests call the tools through `buildAgentToolset`, like the other task tool tests. Storage
is faked with `downloadObjectBufferMock` from `@repo/testing`.

## Standards checklist

- **Deletion:** no change. The text lives on the media row and goes with it when the last
  attachment is removed.
- **Retention:** derived data, kept as long as its media row. No separate expiry.
- **Erasure:** reached through the media row, which organization purge removes with the
  workspace.
- **Docs:** `apps/docs/src/content/docs/agents/tools.mdx` (Tasks row) and
  `apps/docs/src/content/docs/content/tasks.mdx` (attachments section).

## Decisions

- **Extract once in the worker, keep a status.** Reads never parse a file, and the agent gets a
  clear "not ready" instead of a slow call. Extracting on every read lost: it parses a PDF on
  every call and blocks the agent's step. A hybrid (stored text, else extract on read) lost too:
  failed and pending would look the same, and the cost of a slow read stays.
- **The status lives on `media`, not on `task_attachments`.** The text already lives on `media`.
  Splitting the text from its state would put one fact in two tables.

## Design

### Schema (`@repo/database`, `media.schema.ts`)

- `text_extraction_status`: nullable text, `'pending' | 'ready' | 'failed'`. Null means no
  extraction was asked for: images, chat attachments (extracted inline) and generated media.
- `extracted_text_truncated`: boolean, not null, default false.
- Migration (`db:generate`, then hand-added SQL): set `'pending'` on the media rows of existing
  task attachments whose kind is extractable. The sweep picks them up (US-3.4).

### Upload (`apps/api`, `task-attachment.service.ts`)

- An extractable kind is stored with status `'pending'`. After the attachment row is created,
  the service enqueues `extract-media-text` with `{ mediaId }`, job id `extract-media-text:<mediaId>`.
- An enqueue failure is logged, not returned to the user. The sweep retries it.

### Job (`@repo/queue`, `apps/worker`)

- New queue and DTO `{ mediaId }`. The processor skips rows that aren't `'pending'`. It downloads
  the object, runs `extractText`, then stores the text capped at `AGENT_FILE_READ_MAX_CHARACTERS`,
  the truncated flag and `'ready'`. Three attempts with backoff; after the last it sets
  `'failed'`.
- A sweep cron (every 10 minutes) re-enqueues rows that have been `'pending'` for more than 10
  minutes. The job id keeps a running job from being queued twice.

### Tools (`@repo/ai`, `task.tools.ts`)

- `CLOUD_DRIVE_READ_MAX_CHARACTERS` becomes `AGENT_FILE_READ_MAX_CHARACTERS` (100,000), shared by
  the cloud drive `readFile` tool and the job.
- `readTask` adds `attachments: [{ id, filename, mimeType, sizeBytes }]`, loaded with one query
  for the task. `getTaskById` and the REST task detail stay unchanged.
- `readTaskAttachment`, `access: 'read'`. Input (flat `z.object`): `taskId`, `attachmentId`.
  Output: `{ filename, mimeType, text, truncated }`. Failures: `not_found`, `not_ready`,
  `not_readable`.
