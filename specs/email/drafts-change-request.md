# Email Drafts (change request to the Email Client PRD)

> **Status: in-progress** (approved by Sven 2026-08-15; all five slices
> below built the same day, apps/api suite 463 pass / 0 fail; awaiting
> Sven's manual verification, no browser or worker run yet, not committed).
> Amends [prd.md](./prd.md): drafts become
> a first-class, Gmail-backed object covering new mail, reply, reply-all and
> forward, edited inline in the thread area instead of a modal. Reverses two
> v1 non-goals ("Writing AI drafts into Gmail's drafts folder", "Drafts are
> local-only").

## Why

Three gaps in the shipped client:

1. **Composing is throwaway.** New mail, reply, reply-all and forward all
   open `EmailComposeDialog`. Nothing is persisted: closing the modal or
   reloading the page loses the text. Only AI drafts survive.
2. **Two shapes for the same thing.** An AI draft renders inline above the
   thread (`EmailDraftPanel`); a human reply to the same thread renders as
   an overlay. Same act, two different UIs.
3. **The Drafts menu lies.** `/mail/drafts` lists AI drafts pending review
   only. It is not the mailbox's Drafts folder, and it disagrees with what
   Gmail shows under the same name.

## Does Google support drafts? Yes

Gmail's `users.drafts` resource maps onto what we need, with four
properties that shape the design:

- **Methods:** `create`, `get`, `list`, `update`, `send`, `delete`.
- **The draft id is stable; the message id is not.** A draft is a container.
  `update` replaces the contained message wholesale (base64url MIME), so the
  message id changes on every save. We persist `providerDraftId` and never
  key anything on the draft's message id.
- **Threading must be re-supplied on every update.** For a reply draft, each
  `update` call must carry `message.threadId`, RFC 2822 `In-Reply-To` and
  `References`, and a `Subject` matching the thread. Dropping them on one
  save detaches the draft from its thread.
- **`drafts.send` deletes the draft** and returns the new `SENT` message.
  It replaces `send` for any draft that reached Gmail.

Consequence for sync: drafts carry the `DRAFT` system label and therefore
appear in `history.list` as `messagesAdded`/`messagesDeleted`, once per
edit (old message deleted, new one added). Handled explicitly below.

Sources:
[Draft resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts),
[Create and send draft emails](https://developers.google.com/workspace/gmail/api/guides/drafts).

## Decisions

| Question            | Decision                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Where drafts live   | **Hybrid.** Local row is the editing/autosave target; debounced write-back to Gmail.      |
| AI vs user drafts   | **One table, one component.** `email_drafts` gains `origin`, `kind`, recipients, subject. |
| New mail placement  | **Own route** `/mail/draft/:draftId`, draft panel with no thread below.                   |
| Drafts menu         | **All drafts**, including ones created in Gmail elsewhere.                                |
| Creation timing     | Local row on open; pushed to Gmail once it has recipients or body text.                   |
| Concurrency         | **One active draft per thread.**                                                          |
| Forward attachments | Prefilled from the forwarded message, individually removable.                             |
| Discard             | Deletes the Gmail draft too.                                                              |
| AI drafts to Gmail  | Pushed as soon as status flips to `ready`.                                                |

## Scope

### 1. One draft object for all four cases

`email_drafts` becomes the single home for every unsent message, whoever
wrote it. Schema changes (push directly, no hand-written SQL):

- `origin` — `'ai' | 'user'`. Drives the sparkle badge and the review queue
  count, nothing else.
- `kind` — `'new' | 'reply' | 'forward'`. `new` rows have a null `threadId`,
  so `threadId` becomes nullable.
- `agentId` — becomes nullable (`origin: 'user'` has no agent). The FK keeps
  its no-action delete behaviour.
- `to` / `cc` / `bcc` — `jsonb`, `EmailParticipant[]`, defaulting to `[]`.
  Today recipients are re-derived in the panel from `replyToMessage`, which
  cannot express "user added a recipient".
- `subject` — `text`, nullable. Reply/forward seed it from the thread; the
  user may edit it.
- `providerDraftId` — `text`, nullable, unique per account. Null until the
  draft is pushed to Gmail.
- `attachments` — `jsonb`, the draft's pending attachment set (see 5).
- `status` — unchanged vocabulary (`generating | ready | discarded | sent`).
  `origin: 'user'` rows start at `ready`; `generating` stays AI-only.

`replyToMessageId` keeps its meaning for `reply`, and for `forward` points
at the message being forwarded.

### 2. Inline draft panel replaces the compose modal

`EmailDraftPanel` becomes the one draft surface, used by all four entry
points, rendered in the thread area above the messages exactly where AI
drafts already appear. `EmailComposer` stays the shared form underneath;
`EmailComposeDialog.vue` is deleted along with its call sites in
`EmailThreadView.vue` and `EmailClient.vue`.

Entry points and where the panel appears:

| Action                | Route                                              | Below the panel |
| --------------------- | -------------------------------------------------- | --------------- |
| Reply / Reply all     | `/mail/:threadId`                                  | the thread      |
| Forward               | `/mail/:threadId`                                  | the thread      |
| New mail              | `/mail/draft/:draftId`                             | nothing         |
| Open from Drafts list | thread route if it has one, else `/mail/draft/:id` | thread, if any  |
| AI draft (unchanged)  | `/mail/:threadId`                                  | the thread      |

The panel header states which kind it is (Reply / Forward / New message)
and, for `origin: 'ai'`, keeps the sparkle badge and the `generating`
spinner state. Forward starts with an empty recipients field and focus in
it; reply starts with focus in the body.

**One active draft per thread.** Reply/Reply all/Forward on a thread that
already has a non-terminal draft focus and scroll to the existing panel
instead of opening a second one. If the existing draft is a different kind
(e.g. a pending AI reply, and the user clicks Forward), the panel asks to
discard it first. `EmailThreadView`'s `activeDraft` computed already picks
"the one non-terminal draft"; it stops filtering on origin.

### 3. Autosave and Gmail write-back

- Local save is debounced ~1s after the last edit; the panel shows a
  `Saving… / Saved` hint. Recipients, subject, body and attachment set are
  all saved, through `PATCH /email/draft/:draftId` (widened from its current
  content-only body).
- Gmail write-back is debounced ~3s and skipped while the draft is empty:
  a row with no recipients and no body text never reaches Gmail, so an
  abandoned Reply click leaves nothing in the user's real mailbox. The
  first save with content calls `drafts.create` and stores
  `providerDraftId`; later ones call `drafts.update`.
- Every `drafts.update` for a `reply`/`forward` draft re-supplies
  `message.threadId`, `In-Reply-To`, `References` and the thread `Subject`.
  This lives in the provider, built from the same MIME assembly path as
  `send` (`buildOutgoingRaw` in `gmail.provider.ts`).
- **AI drafts are pushed as soon as the worker sets `ready`**, without
  waiting for a user edit, so the user can review them from Gmail mobile
  too. Accepted consequence: an unreviewed AI draft is visible in the real
  mailbox and can be sent from Gmail without passing through our review UI.
  The no-auto-send rule still holds (nothing sends itself), but "every AI
  draft is reviewed in our UI" weakens to "every AI draft is reviewed".
- **Attachment bytes and write-back cost.** `updateDraft` replaces the whole
  MIME message, so a draft carrying a forwarded 20 MB attachment would
  re-upload those bytes on every autosave tick if write-back were naive.
  Rule: for a draft whose `attachments` is empty, write-back stays on the
  ~3s debounce. For a draft with attachments, write-back happens on
  attachment-set change, on panel close, and on send, not on body keystrokes.
  Attachment content is fetched from Gmail (`getAttachment`) at write-back
  time and streamed into the MIME body; it is never stored by us.
- **Send flushes first.** The panel's final edits may not have reached Gmail
  when the user hits send, and `sendDraft` sends whatever Gmail holds. So a
  draft with a `providerDraftId` is always `updateDraft`-ed with the request's
  final content and then `sendDraft`-ed. Never `sendDraft` on its own.
- Conflict handling is last-writer-wins, no merge. Sync notices a
  `providerDraftId` whose Gmail content changed and overwrites the local
  row unless the local panel is currently focused and dirty, in which case
  the next local save wins.

### 4. Send and discard

- Send: if `providerDraftId` is set, `drafts.send` (which deletes the draft
  server-side); otherwise the existing `send` path, unchanged. Both write
  the `sent` status locally. `POST /email/draft/:draftId/send` keeps its
  current contract of persisting the final edited content.
- Discard: `drafts.delete` when `providerDraftId` is set, then the local
  row goes to `discarded` as today. A never-pushed draft is local-only work.
- Deleting an empty abandoned draft: rows that are still empty and
  untouched for 24h are swept by the existing sync cron. They never reached
  Gmail, so this is a local delete.

### 5. Forward carries attachments

A forward draft is seeded with the forwarded message's attachment metadata
(filename, mime type, size, provider attachment id) in the new
`attachments` column. Each is shown in `EmailComposerAttachments` alongside
uploads and media-library picks, and is individually removable. Content is
re-fetched from Gmail at write-back/send time and streamed into the MIME
body; nothing is stored in our storage. Inline `cid:` attachments of the
original are carried the same way so the quoted body does not break.

A draft written in Gmail can also carry attachments of its own. Those bytes
hang off the draft's contained message, whose id is deliberately invisible
outside `@repo/mail`, so the provider exposes
`getDraftAttachment(draftId, attachmentId)` and resolves that id internally.
Without it, editing such a draft here would push a replacement MIME message
with the attachments missing and silently destroy them in the user's real
mailbox — `updateDraft` is a full replace. `providerMessageId` is null on
these, which is how a caller knows to fetch by draft instead.

### 6. Drafts becomes a real folder

`/mail/drafts` stops being the AI review queue and becomes the mailbox's
Drafts folder:

- Lists every non-terminal draft: user drafts, AI drafts, and drafts created
  in Gmail web/mobile (picked up from the `DRAFT` label during sync and
  materialised as `origin: 'user'` rows with a `providerDraftId`).
- Rows render like thread-list rows (recipients, subject, snippet, date),
  not like today's markdown-preview rows, with a sparkle badge for
  `origin: 'ai'`.
- The sidebar badge keeps counting AI drafts pending review, since that is
  the number that means "something wants your attention".
- It sits **visually** in the system-folder list with a `FileEditIcon`,
  alongside inbox/starred/sent/archived/trashed. It stays a route link
  (`/mail/drafts`), not an entry in `EMAIL_FOLDERS`: those ids are
  thread-list filters validated against `emailFolderEnum` on the API, and a
  draft list is not a thread list. Adding `drafts` to that union would send
  an unfilterable folder to `GET /email/thread`.

### 7. Sync must stop treating drafts as mail

Today nothing filters the `DRAFT` label, so once we start writing drafts to
Gmail the poller would ingest them as ordinary messages and the classifier
would categorise the user's own unsent text, once per keystroke batch.

- `email-sync.service.ts` skips `messagesAdded` carrying `DRAFT`, and never
  enqueues classification for them.
- Instead, a `DRAFT`-labelled message resolves to its draft via
  `drafts.list`/`drafts.get` and upserts an `email_drafts` row keyed on
  `providerDraftId`. A `messagesDeleted` for a draft's message is ignored
  (it is the ordinary churn of an update); a draft that disappears from
  `drafts.list` is what marks the local row discarded.
- The thread-list folder filter (`resolveFolderFilter` in
  `email.service.ts`) excludes `DRAFT` in the same places it already
  excludes `TRASH` and `SPAM`, so unsent drafts never appear as messages in
  a thread or in the inbox.

## API changes

Additive, on the existing `email.controller.ts` / `email.service.ts` pair:

- `POST /email/draft` — create an empty draft. Body: `kind`, optional
  `threadId`, optional `replyToMessageId`. Returns the row so the client
  can route to it.
- `PATCH /email/draft/:draftId` — widened from `{ content }` to the full
  editable set (`to`, `cc`, `bcc`, `subject`, `content`, `attachments`).
- `GET /email/draft` — gains a "all drafts for the account" mode for the
  Drafts folder, next to the existing `?threadId=` and `/pending` modes.
- `POST /email/draft/:draftId/discard` and `/send` — unchanged contracts,
  new Gmail-side behaviour (`drafts.delete` / `drafts.send`).

### Wire contract

The draft DTO is the `email_drafts` row as-is (the service already returns
rows for drafts), with dates as ISO strings:

```ts
interface EmailDraft {
  id: string;
  accountId: string;
  origin: 'ai' | 'user';
  kind: 'new' | 'reply' | 'forward';
  threadId: string | null;
  replyToMessageId: string | null;
  agentId: string | null;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  subject: string | null;
  content: string; // markdown
  attachments: EmailDraftAttachment[];
  status: 'generating' | 'ready' | 'discarded' | 'sent';
  providerDraftId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EmailDraftAttachment {
  // Null when the attachment lives on the Gmail draft itself rather than on
  // a forwarded message: fetch those through `getDraftAttachment(draftId, …)`.
  providerMessageId: string | null;
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string | null;
  inline: boolean;
}
```

| Endpoint                             | Request                                                                                          | Response                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| `POST /email/draft`                  | `{ kind, threadId?, replyToMessageId? }`                                                         | `{ draft }`                   |
| `GET /email/draft`                   | optional `?threadId=` — absent means every non-terminal draft on the account (the Drafts folder) | `{ drafts }`                  |
| `GET /email/draft/:draftId`          | —                                                                                                | `{ draft }`, 404 when gone    |
| `GET /email/draft/pending`           | — (unchanged: AI review queue)                                                                   | `{ drafts }`                  |
| `PATCH /email/draft/:draftId`        | any of `{ to, cc, bcc, subject, content, attachments }`                                          | `{ draft }`                   |
| `POST /email/draft/:draftId/discard` | —                                                                                                | `{ draft }`                   |
| `POST /email/draft/:draftId/send`    | unchanged multipart form                                                                         | unchanged `SendEmailResponse` |

`origin`, `kind`, `threadId`, `replyToMessageId` and `agentId` are set at
creation only and are rejected by `PATCH`. `POST /email/draft` refuses a
second non-terminal draft on the same thread (section 2's one-active-draft
rule) with **409 and the same `{ draft }` envelope** a successful create
returns, so the client can focus that draft and read its `kind` to decide
whether to offer a replace.

**Reply-all** is not a `kind`. The client creates a `reply` draft and
follows up with a `PATCH` setting `cc`; server-side reply seeding therefore
fills `to` only and must leave `cc` empty, or the two would fight.

**Quoting moves server-side, amending prd.md.** The original content
pipeline says "the API never appends quotes server-side", which was right
when a send was assembled in the browser. A draft is now a persisted server
object, so the quoted history has to be in the row at creation, otherwise
every reply would be a create followed immediately by a PATCH that only
adds the quote. `POST /email/draft` seeds `content` for `reply`/`forward`
using `buildReplyQuoteMarkdown` from `@repo/mail/content` — the same helper
the client used, so the output is unchanged and there is still exactly one
implementation of it. Markdown stays canonical; nothing renders HTML
server-side.

`MailProvider` (`packages/mail/src/provider/mail-provider.ts`) gains
`createDraft`, `updateDraft`, `getDraft`, `listDrafts`, `sendDraft`,
`deleteDraft`, taking the same `SendMailInput` shape `send` already takes
plus an optional draft id. Gmail is still the only implementation; Graph's
`/messages` draft model fits the same six calls.

## Non-goals (unchanged or newly stated)

- No draft-level collaboration, no multi-device conflict merge (last writer
  wins).
- No scheduled send, no "undo send".
- No rich draft list previews beyond recipients/subject/snippet.
- Multiple concurrent drafts per thread stay out; if it turns out to be
  needed, the schema already allows it and only the panel's single-draft
  assumption has to go.

## Delivery slices

Two waves. Wave 1 is the foundation both later layers type against; wave 2
runs in parallel on top of it, followed by a teamlead integration pass over
the seams.

**Wave 1 (parallel, no shared files)**

- **A — `@repo/database`.** `email.schema.ts` columns + nullability,
  `relations.ts`, `email-draft.repo.ts` (widened update field set, lookup by
  `providerDraftId`, list-all-for-account, empty-and-stale sweep query).
  Owns the `EmailDraft` type every other slice imports.
- **B — `@repo/mail`.** Six draft methods on `MailProvider` plus the Gmail
  implementation in `gmail.provider.ts` / `gmail.client.ts`, reusing
  `buildOutgoingRaw` so a draft update carries the same MIME assembly (and
  threading headers) as a send. No DB, no HTTP.

**Wave 2 (parallel, after wave 1 lands)**

- **C — `apps/api`.** `email.service.ts` draft functions, controller routes,
  `email.schema.ts` validation, plus the `DRAFT` exclusion in
  `resolveFolderFilter`. Extends `test/email/drafts.test.ts`.
- **D — `apps/worker`.** `email-sync.service.ts` DRAFT filtering and
  draft-row reconciliation from `drafts.list`, `email-draft.service.ts`
  pushing AI drafts to Gmail on `ready`, empty-draft sweep on the sync cron.
- **E — `apps/web`.** `EmailDraftPanel` as the one draft surface, deletion
  of `EmailComposeDialog`, `/mail/draft/:draftId` page, autosave composable,
  Drafts folder in `email-folders.ts` / `EmailSidebar`, forward attachments
  in `EmailComposerAttachments`, i18n for both locales.

Seams to watch (the ones that burned the first build): the `EmailDraft`
shape crossing A into C/D/E, and the draft-vs-message id distinction
crossing B into C/D. Nothing outside slice B may know a Gmail draft's
message id exists.

## Open points

- **Sweep cadence for empty drafts.** Piggybacking on the sync cron is the
  cheap option; if it proves noisy, it moves to its own job.
- **Gmail-created drafts with no local thread.** A draft written in Gmail on
  a thread we have never indexed needs its thread pulled in on demand, the
  same lazy path the thread view already uses.
- **Credit accounting** for AI drafts is still the deferral listed in
  [prd.md](./prd.md); nothing here changes it.
