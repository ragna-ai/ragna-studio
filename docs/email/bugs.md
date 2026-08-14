# Email Client Bugs

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
