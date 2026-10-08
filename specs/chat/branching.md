# Chat branching (PRD)

> **Status: implemented** (2026-08-08). Backend (schema/API/tests)
> unchanged and still green. UI went through two revisions: hover buttons,
> then a right-click context menu (dropped — the `data-state` open styling
> was hard to make read well on a message row with no bubble background),
> settled on a hover-revealed "⋯" button opening a dropdown menu.

Lets the user split an ongoing conversation into a separate, parallel chat
at any message. All messages up to and including that message are carried
over into the new chat; the original chat is untouched. Useful for
exploring a different prompt or idea without cluttering the main thread.

## Decisions

| Decision          | Choice                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Model**         | Copy-on-branch: a new, fully independent `chat` row plus copies of the `chat_messages` rows up to the cutoff. Not a shared/lazy-diverging message tree.                                                                               |
| **Entry point**   | Hover-revealed "⋯" icon button on each message in `ChatMessage.vue`, opening a shadcn-vue `dropdown-menu` (click-triggered, not `context-menu`/right-click — tried and dropped, see Status).                                          |
| **Menu items**    | "Branch from here" and "Copy text" (copies the message's rendered text parts to the clipboard). A single-item menu reads oddly, so branching shipped a second, unrelated-but-obviously-useful action rather than staying a one-liner. |
| **Cutoff**        | Inclusive: the clicked message is the last message copied into the new chat.                                                                                                                                                          |
| **Title**         | Auto-generated: `"{original title} (branch)"`. Renamable afterward like any chat.                                                                                                                                                     |
| **Provenance UI** | Shown: the sidebar/chat-list marks a branched chat with a "forked from {original title}" subtitle/badge.                                                                                                                              |

## Why copy, not a shared message tree

The current schema (`packages/database/src/schema/chat.schema.ts`) has no
self-reference anywhere: `chats` is flat per user/workspace/agent, and
`chat_messages` orders purely by `(created_at, id)` with no
`parentMessageId`. Building a real branch tree (one shared prefix, multiple
diverging tips) would mean reworking message ordering and the read path
(`getChatByIdForUser`, `specs/chat/chat-message-persistence.md`) to filter by
branch. Copy-on-branch needs one new self-referential FK pair, reuses the
existing bulk-insert path, and literally satisfies "the original chat stays
completely intact" — the two chats share no rows after the branch is
created, so nothing done in either chat can affect the other.

The existing `apps/web/app/components/ai-elements/message/MessageBranch*.vue`
components are unrelated: a generic, unwired carousel for cycling response
_variants_ in place (ChatGPT-style regenerate arrows), not backed by any
data model. Do not reuse them for this feature; they solve a different
problem (multiple candidate replies for one turn) and nothing currently
renders them.

## Goals (v1)

- Right-click any message to open a context menu with "Branch from here"
  and "Copy text".
- Branching creates a new chat with the same agent/workspace/user, titled
  `"{original title} (branch)"`, containing an exact copy of every message
  up to and including the clicked one.
- The user is navigated to the new chat immediately after branching.
- The original chat is never modified by a branch action, and nothing done
  in the branch (new messages, rename, delete) affects the original.
- Attachments referenced by copied messages keep working in the new chat
  (media reference counting stays correct — see Schema).
- The sidebar shows which chat a branch was forked from.
- "Copy text" copies the message's visible text (concatenated `text` parts,
  same content `MessageResponse` renders) to the clipboard. Reasoning, tool
  calls, and file parts are not included — there's nothing sensible to
  paste for those.

## Non-goals (v1)

- Branching from within a branch's own branch tree view (branches are just
  regular chats; branching a branch works, but there's no tree/graph UI to
  visualize ancestry beyond the one-line "forked from" pointer).
- Merging branches back together.
- Editing a message and regenerating from that point (a related but
  separate feature — see the "not supported" note in
  `specs/chat/chat-message-persistence.md`). Branching does not require
  this; it only appends going forward, same as any chat.
- Deleting the original chat cascading a warning about live branches
  (`forkedFromChatId` is `set null` on delete — see Schema — so branches
  simply lose their provenance link and keep working).

## Schema

New nullable, self-referential columns on `chats`
(`packages/database/src/schema/chat.schema.ts`):

| Column                | Type | Notes                                                                                                                                                                           |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forkedFromChatId`    | text | FK → `chat.id`, `onDelete: 'set null'`. Which chat this was branched from.                                                                                                      |
| `forkedFromMessageId` | text | FK → `chat_messages.id`, `onDelete: 'set null'`. The cutoff message in the _original_ chat (for display only; the branch has its own copy of that message with a different id). |

Both are display/provenance metadata only — never read to reconstruct
content. Register both self-relations in
`packages/database/src/schema/relations.ts` per the project's rule that new
FKs must be added to the relations graph, not just the schema file.

No changes to `chat_messages` (still just `id`, `chatId`, `role`, `parts`,
`metadata`, timestamps). Copied rows get **new** ids (fresh uuidv7) and
`createdAt` timestamps generated at copy time, in the same relative order as
the originals, so the existing `(createdAt, id)` ordering keeps working
unmodified in both chats.

`chat_attachments` (`packages/database/src/schema/media.schema.ts`) is keyed
by `chatId`, not `messageId`, and drives media reference counting
(`media.repo.ts`). Branching must copy the `chat_attachments` rows that
belong to the copied messages' chat, pointing at the same `mediaId` with the
new `chatId`, so a media row already referenced by copied messages doesn't
get garbage-collected out from under the branch. No new attachment/media
data is created; only the link table gets new rows for the second chat.

## API (apps/api)

```
POST /workspace/:workspaceId/chat/:chatId/branch   { messageId: string }
```

Added to `chat.controller.ts` next to the existing chat routes, behind the
same `authMiddleware` + `workspaceGuard`. New `branchChatForWorkspace`
service function in `chat.service.ts`, following the pattern of
`createChatForWorkspace`:

1. Load the source chat and its messages for the workspace (same guard as
   `getChatForWorkspace`); 404 if `messageId` doesn't belong to it.
2. In a transaction: insert a new `chats` row (`agentId`, `workspaceId`,
   `userId` copied from the source; `title` = `"{source.title} (branch)"`;
   `forkedFromChatId` = source id; `forkedFromMessageId` = the cutoff
   message's id in the _source_ chat).
3. Bulk-insert copies of every `chat_messages` row up to and including the
   cutoff (new ids/timestamps, same `role`/`parts`/`metadata`), targeting
   the new chat id.
4. Bulk-insert copies of the `chat_attachments` rows for the source chat
   whose referenced media appears in the copied messages' parts, targeting
   the new chat id.
5. Return the new chat (same shape as `POST /chat`).

Validation: new `validBranchChatBody` (`{ messageId: string }`) in
`apps/api/src/validation/`, following the existing `validChatIdParam` /
`validCreateChatBody` pattern.

## Web app (apps/web)

- **`useChatApi.ts`**: `useBranchChatAndNavigate` mutation
  (`POST .../chat/:chatId/branch`), mirroring `useCreateChatAndNavigate` —
  on success, navigate to `/chat/:newChatId` and invalidate the chat-history
  list query. Unchanged by the context-menu revision.
- **`ChatMessage.vue`**: a hover-only "⋯" `Button` (`variant="ghost"`,
  `opacity-0 group-hover:opacity-100`, plus `data-[state=open]:opacity-100`
  so it doesn't vanish while its own menu is open) as a sibling of
  `MessageContent`, inside `Message` (which already carries the `group`
  class the hover reveal hooks into). Wrapped in shadcn-vue's
  `DropdownMenu`/`DropdownMenuTrigger as-child`/`DropdownMenuContent`, with
  two `DropdownMenuItem`s: "Branch from here" (calls `branchChatAndNavigate`
  from the mutation above) and "Copy text" (`useClipboard` from
  `@vueuse/core`, copying the joined `text` parts). Removes the v1 hover
  `MessageAction`/`MessageActions` markup and the abandoned `context-menu`
  component entirely — those ai-elements components stay unused/available
  for a future per-message action, same status as `MessageBranch*`.
- **`ChatHistoryItem.vue`** / `useGetChatHistory`: when a chat has
  `forkedFromChatId` set, render a small "forked from {original title}"
  subtitle. Requires the chat-list query to include `forkedFromChatId` and
  the source chat's title (a join, or a follow-up lookup keyed by id already
  present in the loaded list — implementer's call based on what's cheapest
  given the existing list query shape).

## Testing

Phase 1 API integration tests only (`specs/testing/strategy.md`); Phase 2
Playwright for `apps/web` doesn't exist yet for any feature, branching
included. New file `apps/api/test/chat/chat-branching.test.ts`, same
`app.request()` + `truncateAllTables()` + `seedAuthenticatedUser()` pattern
as `apps/api/test/chat/chats.test.ts`.

Seeding messages: `runChatStream` (the only current write path for
`chat_messages`) needs a live/mocked AI provider and is explicitly out of
scope for `chats.test.ts` today. Branching doesn't need real streaming to
test the copy logic, so seed messages directly with `createChatMessages`
from `@repo/database` (same pattern `chat-attachments.test.ts` uses for
`createChatAttachment`), then call the branch endpoint over HTTP.

No new pure-unit tests: the copy is a straightforward bulk insert, not the
"genuinely tricky logic" (credit math, pagination cursors) the strategy doc
reserves unit tests for — route-level coverage is enough.

Cases:

- Branching from the last message copies every message into the new chat,
  in the same order, with new ids (assert copied ids differ from source
  ids) and a title of `"{source title} (branch)"`.
- Branching from a message in the middle copies only messages up to and
  including it — later messages in the source chat are absent from the
  branch.
- The source chat is unchanged after branching: same message rows/ids,
  same title, same message count.
- The new chat's `forkedFromChatId` / `forkedFromMessageId` point at the
  source chat and the cutoff message (in the source chat's copy, not the
  branch's).
- `chat_attachments` referencing media used by copied messages are
  duplicated onto the new chat's id (same `mediaId`); `countMediaReferences`
  (`@repo/database`, used in `chat-attachments.test.ts`) reflects both
  chats.
- 404 for a `chatId` that doesn't exist, and for a `messageId` that exists
  but belongs to a different chat.
- 404 when branching another user's chat via the caller's own workspace
  (same cross-user pattern as the existing `GET /chat/:chatId` test).
- `GET /workspace/:workspaceId/chat` includes `forkedFromChatId` on the
  branched chat's list entry (covers the sidebar provenance requirement).

## Later (explicitly deferred)

- A visual branch tree/graph across a chat and all its descendants.
- Merging a branch's messages back into its source.
- Branch-aware "edit and regenerate" (would need the wire-protocol change
  noted in `specs/chat/chat-message-persistence.md` regardless of branching).
- Bulk/cascade actions across a branch family (e.g. "delete this chat and
  all its branches").
- "Copy text" copying rich HTML (bold/lists/tables) alongside plain text,
  so pasting into Word/Docs preserves formatting — see
  `specs/chat/copy-rich-text.md`.
