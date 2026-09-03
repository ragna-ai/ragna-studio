# Email Client Bugs

## First build (2026-08-14)

All resolved on `feat/email-client` (2026-08-14), found during manual
testing of the first working build.

1. ~~Trashed emails are visible in category overview but should not be in
   list (filter on db-level).~~ Fixed: the folder filter's default case
   (category/label/unfiltered views) now excludes `TRASH` and `SPAM`.
2. ~~AI draft email UI height seems limited and is overflowing. It shall
   grow fluently.~~ Fixed: the editor auto-grows and the surrounding
   container scrolls, instead of a fixed-height inner scroll box.
3. ~~If email is opened (body download successful) then it shall be marked
   as read.~~ Fixed, but *not* the way it was first built: marking read is
   an explicit client-side mutation on open, not a side effect of
   `GET /email/thread/:threadId`. A GET that mutates is not idempotent, so
   every refetch silently undid an explicit "mark unread". A test now
   enforces that opening a thread changes nothing server-side.
4. ~~Icons on hover in email list are barely visible because they are
   transparent and overlap with timestamp.~~ Fixed: single action row,
   grid-stacked with the timestamp (no overlap, no layout shift), explicit
   contrast, focus-visible preserved.
5. ~~The read button fires the POST request but the flag stays unread.~~
   Fixed: inverted boolean at both toggle call sites — `read` and
   `isUnread` are opposites, so `read: !thread.isUnread` always re-sent the
   thread's current state.
6. ~~UI modals used in email-feature are too small in width (draft email,
   forward email, attach media from lib).~~ Fixed: dialog widths now follow
   the app's existing conventions per content type.

Follow-up crash found while verifying #3/#5: the mailbox-action endpoints
return message rows without a body, but were typed as if they had one, so
patching the thread-detail cache dropped `body` and the next render threw.
Fixed by typing the action row honestly (`Omit<EmailMessageDetail, 'body'>`),
merging field-wise instead of replacing, and tolerating an absent body in
the components.

## Drafts change request (2026-08-15)

Found during Sven's first manual test of
[drafts-change-request.md](./drafts-change-request.md).

1. ~~Clicking Reply froze the browser outright ("page unresponsive"), and
   re-froze on every revisit to that thread.~~ Fixed. Not a reactivity
   loop: an HTML newsletter turndown-converts into markdown containing a
   single **80,520-character line**, server-side quote seeding put it
   verbatim into the draft's `content`, and hydrating that into an
   *editable* Tiptap instance blocks the main thread indefinitely. The
   read-only thread view renders the same text fine, which is why the
   thread opened at all. Two fixes: `buildReplyQuoteMarkdown` now
   hard-wraps at 1,000 chars (before prefixing `> `, so the blockquote
   stays valid) and caps the quoted body at 10,000; `EmailComposer` refuses
   to mount the editable editor for content with a line over 5,000 chars or
   over 100,000 total, rendering it read-only with autosave *and* send
   disabled. The second fix is not redundant: drafts reconciled from the
   user's real Gmail account carry whatever body Gmail has, and truncating
   or re-serializing those would autosave the damage back into the user's
   real draft.

Diagnosis note worth keeping: the giveaway was in the DB, not the console.
A hard freeze with no Vue "Maximum recursive updates exceeded" warning
rules out a render loop, and `SELECT max(length(l)) FROM
unnest(string_to_array(content, E'\n'))` found the pathological line in one
query.

Known and deliberately not fixed:

- `html-to-markdown.ts` still produces the long line, so stored message
  bodies keep it. Rewriting ingest has a far larger blast radius than
  fixing what we generate, and the read-only render path copes.
- The reconciler imports every draft in the connected mailbox on first
  sync (33 in Sven's case), each costing one metadata fetch, since Gmail's
  `drafts.list` returns bare ids.

## Incremental sync permanently wedged by a deleted message (2026-08-25)

Found in worker logs after a routine package upgrade (unrelated to the sync
logic itself; the race this exposed already existed): `email-sync-queue`
repeatedly failed the same job with `Gmail API error: 404 Not Found`,
raised from `GmailProvider.fetchMessage` via `resolveChanges`.

~~`GmailProvider.syncFromCursor` (`packages/mail/src/provider/gmail/
gmail.provider.ts`) aggregates `users.history.list` records into one
change per message id, then for every `added` change fetches that
message's metadata with `users.messages.get`. If the message is deleted
(spam auto-purge, an immediate user delete, etc.) after Gmail's history
log records the add but before we fetch it, and before Gmail's history log
also records the delete, `messages.get` 404s. That error was uncaught, so
it propagated through `syncFromCursor` → `applyIncrementalSync` →
`syncEmailAccount`, which sets the account's `syncState` to `'error'` and
rethrows so BullMQ retries the job. Because `syncCursor` is only persisted
*after* a sync succeeds (`email-sync.service.ts`, `applyIncrementalSync`),
every retry re-fetched the exact same history range and hit the exact same
already-deleted message, wedging that account's sync permanently until
someone intervened.~~ Fixed: `resolveChanges` now catches a 404 from
`fetchMessage` on the `added` branch and skips that change instead of
letting it bubble up, since there's nothing to import.

Why this is safe to just skip, not just a shortcut: `aggregateHistoryPage`
(`gmail.sync.ts`) already overwrites an `added` entry with a `deleted` one
if both appear within the same sync call's history pages, so this 404 can
only fire when the delete's history record hasn't surfaced yet relative to
the message store. If that `messagesDeleted` record does surface on a
later sync tick, `applySyncChanges`'s deleted-branch calls
`deleteEmailMessageByProviderMessageId` for a message id that was never
imported; that call finds no row, returns `null`, and the thread-cleanup
call it would otherwise trigger is skipped. So the eventual delete event
is a harmless no-op against data that was never written, not a dangling
reference.

## Attachment download 404s with a valid message/attachment (2026-09-03)

~~Downloading an email attachment (`GET /email/message/:messageId/attachment/
:attachmentId`) intermittently 404s with `{"code":404,"error":"Attachment
not found"}`, even for an attachment the user just saw listed on that exact
message.~~ Fixed: `downloadEmailAttachmentForUser`
(`apps/api/src/services/email.service.ts`) did its own live
`fetchMessage(id, 'full')` and matched the client-supplied `attachmentId`
against that fresh fetch's attachment list with strict equality. The
`attachmentId` on the client had been read from an *earlier*, separate
`GET /email/message/:messageId/attachments` call — a second Gmail
`messages.get`. Gmail's `attachmentId` is not documented as stable across
separate fetches of the same message; it's scoped to a single API response,
not to the message as a durable entity. Confirmed via research (see
below), not just inferred from the stack trace: added a server-side
`logger.warn` at the failed-match site first, reproduced, and the response
body's `Content-Length` (43 bytes) matched `{"code":404,"error":"Attachment
not found"}` exactly, ruling out a routing 404 or a "message not found"
404 from `requireOwnedMessage`.

Fix: `MailAttachmentMeta` (`packages/mail/src/provider/mail-provider.ts`)
now exposes two separate ids instead of one:

- `partId` — the MIME part's id, documented by Google as *"The immutable ID
  of the message part"*. Safe to hand to a client and have it come back in
  a later request.
- `attachmentId` — Gmail's opaque content-fetch token. Not safe to persist
  or round-trip; must be re-resolved from a live fetch immediately before
  use.

The download route is now keyed on `partId`
(`/email/message/:messageId/attachment/:partId`).
`downloadEmailAttachmentForUser` still does one live `fetchMessage` (same
as before — no extra round trip), matches by `partId` instead of
`attachmentId`, and then uses *that same fetch's* `meta.attachmentId` to
call `provider.getAttachment`, never the id the client sent. The frontend
(`useDownloadEmailAttachment`, `EmailMessageAttachments.vue`) now keys and
downloads by `attachment.partId`.

Research backing the fix (see `docs/email/bugs.md` git history for the
full source list if needed):

- Gmail API `Message` resource reference documents `MessagePart.partId` as
  *"The immutable ID of the message part."*
  ([developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages))
- A guide dedicated to this exact question states a Gmail `attachmentId` is
  "scoped to a single message and is not globally unique" and warns:
  "Never cache it as a permanent reference — fetch it fresh from the
  message, then download." It recommends persisting `messageId` + filename
  + content hash instead, never the attachment id itself.
  ([cli.nylas.com/guides/gmail-attachment-id-stability](https://cli.nylas.com/guides/gmail-attachment-id-stability))
- `users.messages.attachments.get`'s reference gives the attachment `id`
  path parameter no stability or caching guidance at all, consistent with
  "read it out of a fresh fetch and use it immediately."
  ([developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments/get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments/get))

Known and deliberately not fixed: `resolveForwardAttachments` /
`EmailDraftAttachment.providerAttachmentId`
(`apps/api/src/services/email.service.ts`) has the same class of bug, only
worse — it persists a forwarded message's `attachmentId` into the draft row
in Postgres and re-fetches it at send time, which can be arbitrarily far in
the future. Per the research above, that's exactly the anti-pattern to
avoid. Out of scope here (touches the drafts DB schema and the
write-back/send flow, not just the download endpoint); worth its own fix if
"attachment not found" shows up on sending a forward with attachments.
