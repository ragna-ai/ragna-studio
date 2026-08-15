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
