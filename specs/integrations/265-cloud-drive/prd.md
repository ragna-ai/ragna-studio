# Integrations: cloud drive as a live source for agents (PRD)

> **Status: proposed** (2026-11-04). Issue #265. Extends #224, follows the run-user rule of #229.

Agents can't see the files people keep in Google Drive or OneDrive. Users copy text into a chat or
upload a file, and the copy goes stale. This PRD lets an agent search, read and, if allowed, write
files in the run user's own drive. Files stay in the drive. RAGNA Studio doesn't import, mirror or
sync them. Design: [design.md](./design.md). Build plan: [slices.md](./slices.md).

## Problem

- Agents only know chat uploads, context documents and workspace documents. Drive files need a
  manual copy, which is out of date the moment the file changes.
- #224 built per-user connections and a shared vendor client (#272). No capability uses them for
  files yet.

## Goals

- An agent works with the run user's current drive files, with exactly that user's drive rights.
- The person who sets up the agent chooses read only, or read and write.
- No write happens in chat without the user approving it.
- **Success signal:** an agent answers from a drive file that changed after the chat started.

## Non-goals

- Import, sync or conversion of drive files into documents, datasets or context documents.
- A drive browse view in the app. It follows next to the documents page (#274).
- Delete, move, rename or share drive files.
- Workspace-owned drive connections (#190) and organization integration policy (#224 phase 2).
- Drive tools in workflow nodes outside an agent, and over MCP.

## User stories

Roles: user (any signed-in user), workspace editor (edits agents). "Run user" is the user whose
connection a run uses: the chatting user, the user who starts a workflow run, or the author of a
scheduled run.

### US-1 Connect Google Drive (P1)

As a user, I want to connect Google Drive, so that agents can use my files without uploads.

- **US-1.1** Given a user whose Google connection serves Gmail, when they connect Google Drive,
  then Google asks only for the Drive permissions and their mailbox keeps syncing.
- **US-1.2** Given a user with no Google connection, when they connect Google Drive, then they
  have a Google connection that serves Google Drive only.
- **US-1.3** Given a connection that serves Gmail and Google Drive, when the user turns off Google
  Drive, then drive tools answer "not connected" for them and their mailbox keeps syncing.
- **US-1.4** Given a connection that serves Gmail and Google Drive, when the user disconnects the
  mailbox, then Google Drive keeps working.
- **US-1.5** Rule: when a connection serves no integration any more, it is revoked at the
  provider and removed.

### US-2 Turn on a drive for an agent (P1)

As a workspace editor, I want to turn on each drive for an agent and pick its access level, so
that the agent only gets the drive rights its job needs.

- **US-2.1** Given an agent without Google Drive, when the editor turns it on, then the access
  level is "read only" until they change it.
- **US-2.2** Given an agent with Google Drive set to read only, when it runs, then it is offered
  the search, list and read tools and no tool that writes.
- **US-2.3** Given an agent with Google Drive set to read and write, when it runs, then it is also
  offered the create and update tools.
- **US-2.4** Given an agent update with an access level other than read only or read and write,
  when it is saved, then the API rejects it with `400`.

### US-3 Agent searches and reads drive files (P1)

As a user chatting with an agent, I want it to find and read files in my drive, so that its
answers use the current version of my files.

- **US-3.1** Given a run user with Google Drive connected, when the agent searches or lists a
  folder, then it gets one page of files and folders, each with name, type, last change and
  link, plus a cursor when more exist. Shared drives are included.
- **US-3.2** Given a Google Doc, Sheet or Slides file, when the agent reads it, then it gets the
  content as Markdown, CSV or plain text.
- **US-3.3** Given a PDF, Word, PowerPoint, Excel, CSV, text or Markdown file, when the agent
  reads it, then it gets the file's text. Text over the size limit is cut and marked as cut.
- **US-3.4** Given a file of another type or over the download limit, when the agent reads it,
  then the tool says it can't read this file and why.
- **US-3.5** Given an agent shared in a workspace, when a second user chats with it, then it
  searches and reads that user's drive, never the agent author's.

### US-4 Not connected and failing drives (P1)

As a user, I want a clear answer when my drive can't be reached, so that I know what to fix.

- **US-4.1** Given a run user without Google Drive, when the agent calls a drive tool, then the
  tool answers "not connected" and the chat goes on.
- **US-4.2** Given a connection that needs a reconnect, when the agent calls a drive tool, then
  the tool answers "reconnect Google Drive" and the user sees the reconnect prompt they get for
  mail.
- **US-4.3** Given a file id that doesn't exist or isn't visible to the run user, when the agent
  reads it, then the tool answers "not found".
- **US-4.4** Given Google rate limits the requests, when the limit lasts past the retries, then
  the tool answers "drive busy, try again later" and no secret appears in the answer.

### US-5 Agent writes drive files (P2)

As a user, I want a read and write agent to create and update files in my drive, so that its
results land where my team already works.

- **US-5.1** Given a read and write agent in chat, when it wants to create or update a file, then
  the chat shows the file name, folder and content and waits for the user's approval.
- **US-5.2** Given a pending write, when the user approves it, then the file is created or
  updated and the chat links to it. When the user denies it, then nothing changes in the drive.
- **US-5.3** Given a file the connection may only read, when the agent updates it, then the tool
  answers "this file is read only for RAGNA Studio" and the file is unchanged.
- **US-5.4** Given a scheduled or workflow run of a read and write agent, when it creates or
  updates a file, then the write runs without approval and the run's trace names the file.
- **US-5.5** Given an approval the server didn't issue, when the chat continues, then no write
  happens.

### US-6 OneDrive (P3)

As a user with a Microsoft connection, I want the same drive features for OneDrive and
SharePoint, so that agents work with my files whichever suite we use.

- **US-6.1** Rule: US-1 to US-5 hold for OneDrive, proven by the same contract tests.
- **US-6.2** Given a Microsoft connection, when the agent searches, then it finds files the user
  can open, including files shared with them.
- **US-6.3** Given an agent with Google Drive read only and OneDrive read and write, when it runs,
  then it gets a separate tool set per drive, each with its own access level.

## Testing

| Criterion              | Level            | Folder                        |
| ---------------------- | ---------------- | ----------------------------- |
| US-1.1 to US-1.5       | API              | `apps/api/test/integrations/` |
| US-2.1, US-2.4         | API              | `apps/api/test/agent/`        |
| US-2.2, US-2.3         | API              | `apps/api/test/cloud-drive/`  |
| US-3.1 to US-3.5       | API (contract)   | `apps/api/test/cloud-drive/`  |
| US-4.1 to US-4.4       | API (contract)   | `apps/api/test/cloud-drive/`  |
| US-5.1                 | e2e (Playwright) | `apps/web/e2e/`               |
| US-5.2, US-5.3, US-5.5 | API (contract)   | `apps/api/test/cloud-drive/`  |
| US-5.4                 | worker           | `apps/worker/test/workflow/`  |
| US-6.1, US-6.2         | API (contract)   | `apps/api/test/cloud-drive/`  |

## Standards checklist

- **Deletion:** no drive data is stored. Turning off the tool or the integration deletes nothing.
  Connection removal follows #224 (revoke, then hard delete).
- **Retention:** drive text the agent read lives in the chat's tool results, like any tool
  result, and goes with the chat. Nothing else is kept.
- **Erasure:** user and organization purge already revoke and delete connections (#224) and
  chats. Nothing new.
- **Docs:** new page `apps/docs/src/content/docs/integrations/cloud-drive.mdx`. Update
  `integrations/connections.mdx` and `agents/tools.mdx`. Self-hosting: enable the Drive API and
  add the scopes to the OAuth consent screen.

## Decisions

**Google gets `drive.readonly` plus `drive.file`, not full `drive`.** Agents need to search and
read the whole drive. They don't need to change files people wrote. With these scopes an agent
can only write files RAGNA Studio created. Both read scopes are restricted, so the hosted app needs
Google's restricted-scope review either way. Gmail needs it already. Lost: `drive` (edit any file,
same review) and `drive.file` with the Google Picker (no review, but no browsing or search).
Upgrading to `drive` later is one more consent for each user.

**OneDrive gets `Files.ReadWrite.All`.** Microsoft has no scope for "only files the app created".
We don't narrow it further just to match Google. Read and write rights then come from the user's
own rights in Microsoft 365. Lost: `Files.Read.All` plus `Files.ReadWrite` (write only in the
user's own OneDrive).

**Drive shares the provider connection. Turning it off unbinds it locally.** Google and Microsoft
keep one grant per user and app, so a separate Drive token would be revoked together with Gmail.
Turning Drive off stops RAGNA Studio from using it. The Drive permission stays granted at the
provider until the whole connection is removed. Lost: one token per integration (rejected in
#224 for the same reason).

**Each drive is its own tool on the agent.** Google Drive and OneDrive get separate toggles and
access levels, and the agent sees a separate tool set per drive. The model always knows which
drive it acts on, and an agent can read one drive while it writes the other. Lost: one "cloud
drive" toggle with a drive parameter on every call.

**Unattended runs write without approval.** Scheduled and workflow runs have nobody to ask.
"Read and write" is an explicit choice per agent, and both vendors keep version history. Lost:
making every unattended run read only.
