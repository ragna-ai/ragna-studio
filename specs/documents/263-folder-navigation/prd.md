# Documents: Drive-style folder navigation (PRD)

> **Status: implemented** (2026-11-04, PR #266). Issue #263. Extends the [documents PRD](../prd.md).

Folders exist, but the documents page doesn't let you go into them. Today every document sits in
one table, with a grey header row per folder. Folders are managed in a separate dialog. This PRD
turns the page into a Drive-style list: folders first, then documents, and a folder opens like a
place you go into.

Folders stay flat. There is no grid view and there are no document cards.

## Problem

- The page shows every document at once. As a workspace grows, the folder headers stop helping.
- Folder rename and delete live in a dialog, away from the folders themselves.
- You can't link to a folder. Back and forward don't move between folders.

## Goals

- The top level shows all folders, then the documents in no folder.
- Opening a folder shows only its documents. The open folder is part of the URL.
- Folder actions live in the folder's own row.
- Documents and folders never cross a workspace boundary, and never an organization boundary.
- **Success signal:** n/a.

## Non-goals

- Nested folders. Folders stay flat (`parentId` comes later).
- Search. Follow-up issue #264.
- A grid view or document cards.
- Copying documents or folders. There is no copy action. A move never leaves the workspace (US-6).
- Drag and drop onto a folder row. The move menu stays the only way.

## User stories

Roles: workspace editor (any member who can write to the workspace). "User" means any signed-in
user. The workspace types are personal, organization and restricted.

### US-1 Browse the top level (P1)

As a workspace editor, I want to see folders first and then the unfiled documents, so that I find
my way through a large workspace.

- **US-1.1** Given a workspace with folders, filed documents and unfiled documents, when a
  workspace editor opens the documents page, then they see every folder first, then only the
  unfiled documents.
- **US-1.2** Given a folder that holds documents, when the list shows it, then the row shows how
  many documents it holds.
- **US-1.3** Given a workspace with no folders and no documents, when the page opens, then an
  empty state offers to create a document or a folder.

### US-2 Open a folder (P1)

As a workspace editor, I want to open a folder and get back out, so that I work with one group of
documents at a time.

- **US-2.1** Given a folder with documents, when a workspace editor opens it, then only its
  documents are listed and the breadcrumb shows the folder name.
- **US-2.2** Given an open folder, when they go back through the breadcrumb or the browser, then
  they see the top level again.
- **US-2.3** Given a link to an open folder, when another member of the workspace opens it, then
  they see the same folder.
- **US-2.4** Given an empty folder, when it is opened, then an empty state offers to create a
  document in it.
- **US-2.5** Given a link to a folder that was deleted, when it is opened, then the user sees
  "Folder not found" and a way back to the top level.

### US-3 Create a document in the open folder (P1)

As a workspace editor, I want a new document to land in the folder I'm in, so that I don't have to
move it afterwards.

- **US-3.1** Given an open folder, when a workspace editor creates a document, then it is filed in
  that folder.
- **US-3.2** Given the top level, when a workspace editor creates a document, then it is in no
  folder.

### US-4 Manage folders in the list (P1)

As a workspace editor, I want to create, rename and delete folders right in the list, so that I
don't need a separate dialog.

- **US-4.1** Given the documents page, when a workspace editor creates a folder, then it appears
  in the list.
- **US-4.2** Given a folder, when a workspace editor renames it from its row, then the list and the
  breadcrumb show the new name.
- **US-4.3** Given a folder with documents, when a workspace editor deletes it and confirms, then
  the folder is gone and its documents are at the top level.
- **US-4.4** Rule: a folder name is 1 to 255 characters. An empty name is rejected with `422`.
  Two folders may share a name.

### US-5 Move a document (P1)

As a workspace editor, I want to move a document into another folder or to the top level, so that
I can reorganise as the work changes.

- **US-5.1** Given a document in an open folder, when a workspace editor moves it to another
  folder, then it leaves the current list and both folder counts update.
- **US-5.2** Given a filed document, when a workspace editor moves it to the top level, then it is
  listed at the top level.

### US-6 Workspace boundary (P1)

As an organization owner, I want documents and folders to stay in their workspace, so that content
in a personal or restricted workspace, or in another organization, stays private.

- **US-6.1** Given a user without access to a workspace (another organization, or a colleague's
  personal or restricted workspace), when they request its folders, one folder or its documents,
  then the API answers `404`.
- **US-6.2** Given a folder of workspace B, when a user renames, deletes or opens it through
  workspace A, then the API answers `404` and the folder is unchanged. This holds for B in the
  same organization and in another organization.
- **US-6.3** Given a document of workspace B, when a user reads, moves or deletes it through
  workspace A, then the API answers `404` and the document is unchanged.
- **US-6.4** Given a folder of workspace B, when a user files a document of workspace A into it
  (on create or on move), then the request is rejected and the document keeps its folder.
- **US-6.5** Given an agent of workspace A, when it reads, edits or files a document into a
  document or folder of workspace B, then the tool answers "not found" and nothing changes.

## Testing

| Criterion        | Level                              | Folder                                                         |
| ---------------- | ---------------------------------- | -------------------------------------------------------------- |
| US-1.1, US-1.2   | API                                | `apps/api/test/document/`, `apps/api/test/folder/`             |
| US-1.3           | e2e (Playwright)                   | `apps/web/e2e/`                                                |
| US-2.1           | API                                | `apps/api/test/document/`                                      |
| US-2.2 to US-2.4 | e2e (Playwright)                   | `apps/web/e2e/`                                                |
| US-2.5           | API                                | `apps/api/test/folder/`                                        |
| US-3.1, US-3.2   | e2e (Playwright)                   | `apps/web/e2e/`                                                |
| US-4.1 to US-4.4 | API (exists, extend for US-4.4)    | `apps/api/test/folder/`                                        |
| US-5.1, US-5.2   | API                                | `apps/api/test/document/`                                      |
| US-6.1           | API                                | `apps/api/test/folder/`, `apps/api/test/document/`             |
| US-6.2, US-6.3   | API                                | `apps/api/test/folder/`, `apps/api/test/document/`             |
| US-6.4           | API (exists)                       | `apps/api/test/document/document-workspace-references.test.ts` |
| US-6.5           | API (create exists, add read/edit) | `apps/api/test/document/`                                      |

US-6 tests run each case twice: workspace B in the same organization and in another organization.

## Standards checklist

- **Deletion:** unchanged. Folder delete is a hard delete and moves its documents to the top level.
- **Retention:** n/a, no new stored data.
- **Erasure:** n/a, no new personal data.
- **Docs:** `apps/docs/src/content/docs/content/documents.mdx` (folders section).

## Design

- **Web:** `pages/document/index.vue` reads `?folder=<id>` from the route. `DocumentTable.vue`
  becomes one list: folder rows (folder icon, name, count, row menu) and then document rows. The
  "Folder" column and `FolderManageDialog.vue` go away. "New folder" joins "New document" in the
  header. A `PageBreadcrumb` shows `Documents › <folder>`.
- **API:** `GET /workspace/:workspaceId/folder` adds `documentCount` per folder, in one
  `GROUP BY` query. New `GET /workspace/:workspaceId/folder/:folderId` for the breadcrumb and the
  not-found state. `GET /workspace/:workspaceId/document` takes an optional `folderId` query param
  (`root` or a folder id). Without it the list stays unfiltered, so agent tools and the home
  overview keep working. A folder id from another workspace answers `404`.
