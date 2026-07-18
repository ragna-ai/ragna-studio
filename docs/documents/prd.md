# Documents Feature (PRD)

Workspace-scoped documents that both humans and agents can create and edit.
Humans use a Tiptap editor in the web app. Agents use tools during chat.

## Goals (v1)

- A document lives in a workspace. Everyone with access to the workspace sees it.
- Humans create, edit, delete, and organize documents into folders.
- Agents list, read, create, and edit documents via tools. Agents cannot delete.
- Documents can be grouped into flat folders (no nesting in v1).

## Non-goals (v1)

- Real-time collaboration (Yjs) and live conflict resolution. Polling can come later.
- Nested folders. Later: add `parentId` to `folder`.
- Docs in multiple folders (tagging). Later: switch `folderId` to a join table if needed.
- Agent-managed folders. Agents never create, rename, or delete folders.
- Injecting documents as chat context. Tool-based read is enough for v1.
- Per-edit authorship history. Only creation authorship is tracked.

## Canonical format: Markdown

The database stores markdown text as the single source of truth.

- Agent tools read and edit plain markdown (append / str_replace), same proven
  pattern as the memory tool.
- The Tiptap editor parses markdown on load and serializes back to markdown on save.
- Trade-off (accepted): advanced formatting that markdown cannot express is not
  supported.

## Rename: `agentDocument` → `agentContextDocument`

The existing `agentDocument` table is a different feature (uploaded files
hard-tied to one agent for context extraction). To avoid confusion with the new
`document` table, rename it:

- Schema export: `agentDocument` → `agentContextDocument`
- Table name: `agent_documents` → `agent_context_documents`
- File: `agent-document.schema.ts` → `agent-context-document.schema.ts`
- All call sites: database queries, API services/controllers, worker processors,
  web app, `relations.ts`.

No backward compatibility needed. Straight rename plus `db:push`.

## Schema

### `folder` (table `folders`)

| Column        | Type | Notes                                    |
| ------------- | ---- | ---------------------------------------- |
| `id`          | text | `primaryIdColumn`                        |
| `workspaceId` | text | FK → `workspace.id`, cascade, indexed    |
| `name`        | text | not null                                 |
| timestamps    |      | `...timestamps` from `common.schema`     |

### `document` (table `documents`)

| Column             | Type | Notes                                              |
| ------------------ | ---- | -------------------------------------------------- |
| `id`               | text | `primaryIdColumn`                                  |
| `workspaceId`      | text | FK → `workspace.id`, cascade, indexed              |
| `folderId`         | text | nullable FK → `folder.id`, null = root level       |
| `title`            | text | not null                                           |
| `content`          | text | markdown, not null, default `''`                   |
| `createdByUserId`  | text | nullable FK → `user.id`                            |
| `createdByAgentId` | text | nullable FK → `agent.id`                           |
| timestamps         |      | `...timestamps`                                    |

Authorship: exactly one of `createdByUserId` / `createdByAgentId` is set.
No separate `role` column. Which column is non-null identifies user vs agent,
and display names resolve via relations joins.

On folder delete: documents move to root (`folderId` set null), they are not
deleted with the folder.

Both tables must be registered in `packages/database/src/schema/relations.ts`
(schema object plus FK relations), not just exported from `schema/index.ts`.

## Agent tools

New file `packages/ai/src/tools/document.tools.ts`, following the existing
patterns:

- Workspace-scoped like `dataset.tools.ts`: the tool factory receives the
  `workspaceId` and every tool checks scope before touching a document.
- Flat `z.object` input schemas only (no top-level unions), as in
  `memory.tool.ts`.

| Tool               | Behavior                                                              |
| ------------------ | --------------------------------------------------------------------- |
| `list_documents`   | Returns id, title, and folder name per document in the workspace.     |
| `read_document`    | Returns title and markdown content by id.                             |
| `create_document`  | Title, content, optional `folderId`. Sets `createdByAgentId`.         |
| `edit_document`    | `append` or `replace` (str_replace with unique-match guard), like the memory tool. |

No delete tool for agents.

## API (apps/api)

Documents controller + service, thin controller with logic in the service.
All endpoints workspace-scoped and auth-guarded.

- Documents: list (with folder info), get, create, update (title, content,
  folderId), delete.
- Folders: list, create, rename, delete.
- Document save doubles as the autosave endpoint (debounced client-side).
  Last writer wins in v1. No conflict detection yet.

## Web app (apps/web)

- Documents page: folder sidebar or grouping plus document list, create/delete
  for documents and folders, move document to folder.
- Editor page: Tiptap v3 editor component living in `apps/web` (not in the
  package, so it gets HMR, shadcn-vue, and Tailwind) with toolbar, markdown
  parse on load, markdown serialize on save, debounced autosave.
- Display authorship (user or agent name) on documents.
- Agent edits appear after reload. No polling in v1.

## Prior art: old Tiptap integration

An earlier integration exists at
`/Users/sven/var/ragna/ragna-cloud-mono/frontend/src/modules/editor` (also
Tiptap v3, so code ports directly). Reuse selectively:

**Port:**

- `components/EditorMenu.vue`: toolbar built on shadcn Button + lucide icons.
- Formatting helpers from `stores/editor.store.ts`: `formatText`, `cycleList`,
  `cycleTextOrientation`, `toggleTaskList`, undo/redo. Lift them into a
  composable, do not port the Pinia singleton store.
- The extension lineup from `_createEditorInstance`: StarterKit (codeBlock
  off), Placeholder, Highlight, Underline, TextAlign, TaskList/TaskItem,
  ListKeymap. This becomes the `@repo/editor` kit export.
- `components/EditorContainer.vue` layout (centered sheet on stone background)
  as a visual reference only.

**Do not port:**

- Comments system (extension + components): markdown cannot represent it.
- Inline completion, AI assistant popups, `EditorChat`: deferred AI-in-editor UX.
- Socket-driven command path (`runCommand`, `command.schema.ts`, `NodeTracker`):
  the old architecture pushed agent commands into the live editor. Replaced by
  agent-edits-markdown-in-DB.
- `invisible-characters.ts`: self-contained, but out of v1 scope.

## Later (explicitly deferred)

- Polling or real-time updates while a document is open.
- Nested folders (`parentId` on `folder`).
- Documents as injectable chat context.
- Edit history / per-edit authorship.
