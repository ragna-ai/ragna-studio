# Email Compose: Sandbox the Quoted History in an Iframe (change request)

> **Status: implemented** (raised, decided, and built by parallel Sonnet
> agents 2026-08-16, committed to `main` same day; manual browser pass
> through reply/forward compose confirmed by Sven 2026-08-16). Amends
> [html-content-change-request.md](./html-content-change-request.md)'s
> quoting section and closes its own open point ("the oversized-content
> composer guard ... needs re-evaluating once quoting no longer produces a
> single giant line by construction"). Builds on the removal of
> `email-draft-safety.ts` (this session, 2026-08-16): that guard's read-only
> fallback still parsed the same HTML through the same editor, so it never
> actually isolated anything - this document proposes the isolation that
> guard was reaching for.

## Why

Two symptoms Sven noticed, one root cause: reply/forward drafts seed their
initial `content` with the replied-to message's HTML wrapped in
`<blockquote>` (`buildReplyQuoteHtml`,
`packages/mail/src/content/reply-quote.ts`), and that whole blob - the
user's own new reply text _and_ the quoted history - lives in one Tiptap
document (`EmailComposer.vue`'s `useEmailComposeEditor`), rendered live in
the app's own DOM.

- **Visual.** `DocumentEditor.css`'s `.document-sheet .ProseMirror
  table`/`th`/`td` and `blockquote` rules apply unconditionally to whatever
  the editor renders, including a sender's original HTML. A layout table
  with no visible border in the original message picks up the editor's own
  `border: 1px solid var(--border)` the moment it's parsed into the compose
  doc. The read pane doesn't have this problem: `EmailMessageItem.vue`
  renders message HTML through `EmailContentIframe.vue`, a real `<iframe>`
  with its own document that never sees `.document-sheet`'s CSS at all.
- **Security.** The read pane treats sender HTML as untrusted and isolates
  it in a sandboxed `<iframe srcdoc>` with a strict CSP (`default-src
  'none'`, no scripts, no forms, only `https:`/`data:` images -
  `EmailContentIframe.vue`). The compose editor has no equivalent boundary:
  the quote is sanitized server-side before it reaches the browser
  (`sanitizeQuotedHtml`, a deliberate byte-for-byte mirror of the iframe's
  own sanitizer config), but once it's in the browser it's parsed by Tiptap
  straight into the app's own live page DOM, not a sandboxed document.
  `sanitizeQuotedHtml` intentionally does not strip `<style>` tags or
  `style` attributes ("email HTML commonly needs it") - reasonable for
  content headed into an iframe with its own document, but a `<style>`
  element (or anything DOMPurify's allowlist doesn't fully anticipate)
  landing in the _main page's_ DOM has no natural containment the way it
  does inside an iframe. Whatever Tiptap's schema happens to do with a
  `<style>` element today is incidental parsing behavior, not a designed
  security boundary, and shouldn't be the thing standing between a
  malicious sender and the surrounding app chrome.

Both symptoms trace to the same structural choice: quoted history and the
user's own text share one editable surface. The fix is the one every
mainstream mail client already uses - split them.

## Decisions

| Question                                         | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where does the quote render?                     | A read-only block through `EmailContentIframe`, the same component/sandboxing the thread read pane already uses - not the Tiptap editor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Is the quote still editable?                     | No, not in v1. Matches Gmail/Outlook/Apple Mail's default (quoted history is read-only, collapsed/expanded but not inline-editable). Users who currently trim/edit history inline lose that ability; called out as a deliberate behavior change, not an oversight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Collapse/expand affordance                       | **Reversed 2026-08-16** (after initial build): the quote isn't rendered in the compose UI at all. `EmailComposer.vue` only ever renders inline in `EmailThreadView.vue`, directly above the full message thread, which already shows the original message in full via its own `EmailContentIframe` (`EmailMessageItem.vue`) - the only other place a draft renders, the standalone `/mail/draft/:draftId` route, only ever shows `kind: 'new'` drafts, where `quotedHtml` is always null. A collapsible quote block in the composer never surfaces anything the user can't already see just below it, so it was removed as redundant. `content`/`text`/`quotedHtml`/`quotedText` still round-trip through storage and send-time joining exactly as built (see Scope §3); only the compose-time rendering was dropped. |
| Storage: columns vs. table                       | Nullable columns on `email_drafts` (`quotedHtml`/`quotedText`), not a separate table - at most one quote per draft, never queried independently, so a join buys nothing today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `EmailContentIframe` sizing in the compose panel | Inherit its existing `ResizeObserver`-driven auto-height as-is; no compose-specific cap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Where does the user type their new reply?        | A Tiptap instance that starts empty (or a single empty paragraph) for `reply`/`forward`, same as `new` already effectively is. `content`/`text` narrow to mean "the user's own new text" only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Who builds the quote block?                      | `buildReplyQuoteHtml` (`packages/mail/src/content/reply-quote.ts`), same sanitize logic. **Reversed 2026-08-16:** the 10,000-char truncation cap (`QUOTE_MAX_LENGTH`, tag-boundary truncation, the "… (quoted message trimmed)" marker) was removed - it existed only to protect the browser-side Tiptap editor from a pathologically large quote, and the quote no longer reaches Tiptap at all (it's never rendered client-side per the row above). The read pane's `EmailContentIframe` already handles messages of any size without a cap; `buildReplyQuoteHtml` now just sanitizes, no length limit.                                                                                                                                                                                                             |
| Send-time MIME assembly                          | `buildDraftSendMailInput` (apps/api) and `pushDraftToGmail`'s write-back (apps/worker) concatenate `content + quotedHtml` / `text + quotedText` into the outgoing `html`/`text`, through one shared helper - not two independent assemblies that happen to agree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Existing in-flight drafts                        | Not migrated. A draft created before this ships keeps its old single-blob `content` (quote baked in, `quotedHtml` null) and renders through a legacy fallback - the same single editable Tiptap instance, current behavior - until sent or discarded. No backfill (same non-goal precedent as `html-content-change-request.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Oversized-content composer guard                 | Stays removed. The compose editor now only ever parses the user's own typed text, which is naturally bounded - the previously-risky part (arbitrarily large or pathological sender HTML) moves entirely onto the iframe path, the same path that already renders received messages of any size without hanging.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Scope

### 1. Storage: split the quote out of `content`/`text`

`packages/database/src/schema/email.schema.ts`'s `emailDraft` table gains
`quotedHtml: text('quoted_html')` and `quotedText: text('quoted_text')`,
both nullable, no default (`null` is the explicit "no quote" state for
`kind: 'new'`, distinct from `''`). `db:push`, no hand-written migration
(per repo convention).

`EmailDraft`/`EmailDraftEditableFields`
(`apps/web/app/features/email/types/index.ts`) gain matching optional
fields. `PATCH /email/draft/:draftId` validation
(`apps/api/src/validation/email.schema.ts`) does **not** widen to accept
them from the client - the quote is server-authored only, set once at
creation, never edited afterward. Only `content`/`text` stay
client-writable via autosave.

### 2. Draft creation: store the quote separately

`createEmailDraftForUser` (apps/api, `reply`/`forward`):
`buildReplyDraftContent` splits into two return values instead of one
combined `{ content, text }` - the quote's HTML/text (from
`buildReplyQuoteHtml`/its text derivation) go to `quotedHtml`/`quotedText`;
`content`/`text` are seeded empty, same as `kind: 'new'` already does.

Worker AI drafts (`apps/worker/src/mail/email-draft.service.ts`,
`generateEmailDraft`/`pushDraftToGmail`): `buildDraftContentWithQuote`'s
`${htmlBody}${buildReplyQuoteHtml(...)}` string concatenation goes away.
`content`/`text` become the agent's own reply (`htmlBody`/its text form)
untouched; `quotedHtml`/`quotedText` are written once, from the same
`buildReplyQuoteHtml` call, same as the API path.

### 3. Compose UI: two surfaces instead of one

`EmailComposer.vue`:

- `useEmailComposeEditor` seeds from `props.draft.content` only (the user's
  own text) - for a fresh reply/forward this is now empty, so the editor
  opens with cursor-ready blank space instead of the cursor parked at
  position 0 of someone else's quoted HTML.
- `buildContentFields()`/`buildSnapshot()` (autosave, pre-send flush) keep
  reading only the live editor's `getHtml()`/`getText()` for
  `content`/`text`; `quotedHtml`/`quotedText` are never re-sent by the
  client (immutable once created).
- **`EmailComposer.vue` itself never renders `quotedHtml`/`quotedText`
  (reversed 2026-08-16, see Decisions table).** `EmailDraft.quotedHtml`/
  `quotedText` (`apps/web/app/features/email/types/index.ts`) still carry the
  data down to the client - other code may read the shape, and the fields
  round-trip through storage (§1/§2) and send-time joining (§4) exactly as
  built - the compose UI is just write-only with respect to them: it reads
  `content`/`text` off the live editor and never displays the quote. The
  quote is instead always visible to the user already, via
  `EmailThreadView.vue` rendering the full message thread (through
  `EmailMessageItem.vue`'s own `EmailContentIframe`) directly below the
  composer for `reply`/`forward` drafts - the only kinds that ever have a
  non-null `quotedHtml`.

### 4. Send-time assembly: recombine at the edge

`buildDraftSendMailInput` (apps/api) and `pushDraftToGmail`'s write-back
(apps/worker): the `html`/`text` sent to the provider become `draft.content

- (draft.quotedHtml ?? '')`/`draft.text + (draft.quotedText ?? '')`, via
  one small join helper shared by both call sites (new export in
  `@repo/mail/content`, e.g. `joinDraftContentWithQuote`) - the same
  "one shared builder, not two independent assemblies" discipline
  `html-content-change-request.md` already established for the quote builder
  itself.

`isDraftEmpty` (apps/api) keeps checking `content.trim().length === 0` -
now correctly means "no new text typed". Called out so it isn't mistaken
for a regression during review: today this check is already a no-op for an
untouched `reply`/`forward` (their `content` is never actually empty before
this change either), since `to`/`cc`/`bcc` already carry the real
non-empty signal for those kinds.

## What becomes dead code

`buildReplyQuoteHtml`, `sanitizeQuotedHtml`, `EmailContentIframe`, and
`DocumentEditor.css` are all reused as-is - the _implicit_ assumption that
`content` always starts with a quote for `reply`/`forward` is what
disappears from the code's shape.

One thing did get deleted outright, decided after the initial build (see
"Who builds the quote block?" in Decisions): `reply-quote.ts`'s
`QUOTE_MAX_LENGTH`, `TRIMMED_MARKER_HTML`, `VOID_TAG_NAMES`,
`truncateHtmlAtTagBoundary`, `closeAndTrim`, and `trackTagDepth` - the
whole tag-boundary truncation machinery built for the 2026-08-15 freeze bug
(`specs/email/bugs.md`). It only ever existed to keep a giant quote from
hanging Tiptap; once the quote stopped reaching Tiptap, the guard had
nothing left to protect. `buildQuotedBodyHtml` was inlined into
`buildReplyQuoteHtml` since it was down to a single sanitize call.

## Non-goals

- No inline-editable quote, no per-message quote trimming UI. A user who
  wants to remove part of the quoted history discards/recreates the draft,
  same coarse-grained behavior as today, just now also true at the quote
  level specifically.
- No migration/backfill of existing single-blob drafts.
- No change to the read pane (`EmailMessageItem.vue`/
  `EmailContentIframe.vue`) - already correct; this document brings compose
  in line with it.
- No change to `buildReplyQuoteHtml`'s sanitization (`sanitizeQuotedHtml`)
  - still needed regardless of where the result is rendered, since it's also
    the exact string eventually sent in the outgoing MIME `html` part. (The
    separate length cap that used to sit alongside sanitization was removed -
    see the "Who builds the quote block?" row in Decisions.)

## Delivery slices

Two waves, same pattern as `html-content-change-request.md`.

**Wave 1 (parallel, no shared files)**

- **A — `@repo/database`.** `emailDraft` (`packages/database/src/schema/email.schema.ts`)
  gains `quotedHtml: text('quoted_html')` and `quotedText: text('quoted_text')`,
  both nullable (no `.notNull()`, no `.default()` - unlike `content`/`text`).
  `db:push`, no hand-written SQL. `email-draft.repo.ts`'s
  `UpdateEmailDraftFields` widens to include both: the worker still sets
  them once via `updateEmailDraft` when a generating row's body is written
  (see slice D), so this isn't purely an insert-time field even though
  clients never PATCH it themselves. `createEmailDraft`/`NewEmailDraft`
  need no code change - both flow through automatically once they're real
  columns.
- **B — `@repo/mail`.** A new join helper in `content/reply-quote.ts`
  (same file `buildReplyQuoteHtml` already lives in - one file owns "the
  quote", assembly included), e.g.
  `joinDraftContentWithQuote({ content, text, quotedHtml, quotedText })
  -> { html, text }`, doing the `content + (quotedHtml ?? '')` /
  `text + (quotedText ?? '')` concatenation. Pure string function, no DB or
  browser dependency, so it doesn't need slice A to land first - just needs
  to exist before wave 2 reads it. Export it from `content/index.ts` like
  every other helper there.

**Wave 2 (parallel, after wave 1 lands)**

- **C — `apps/api`.** `createEmailDraftForUser`'s `buildReplyDraftContent`
  splits its single `{ content, text }` return into
  `{ content: '', text: '', quotedHtml, quotedText }` for `reply`/`forward`
  (quote-only, no seeded reply text); `kind: 'new'` stays all-empty,
  `quotedHtml`/`quotedText` `null`. `buildDraftSendMailInput` calls slice
  B's `joinDraftContentWithQuote` instead of reading `draft.content`/
  `draft.text` directly. `PATCH /email/draft/:draftId` validation
  (`apps/api/src/validation/email.schema.ts`) is **not** touched to accept
  `quotedHtml`/`quotedText` - they stay absent from the client-writable
  shape. `EmailDraft`'s API-side response shape gains the two fields
  (read-only). Extend `test/email/drafts.test.ts` for the split creation
  shape and the joined send output.
- **D — `apps/worker`.** `email-draft.service.ts`: `buildDraftContentWithQuote`
  (the `${htmlBody}${buildReplyQuoteHtml(...)}` concatenation) is deleted;
  the agent's own `htmlBody`/its text form become the `content`/`text`
  passed to `updateEmailDraft`, and `buildReplyQuoteHtml`'s output is
  passed as `quotedHtml`/`quotedText` in that same call. Wherever the
  worker pushes the live Gmail draft's body (`pushDraftToGmail`), switch to
  slice B's `joinDraftContentWithQuote` for the outgoing MIME, same as
  slice C's send path. Agent prompt (`DRAFT_TASK_INSTRUCTIONS`) unchanged.
- **E — `apps/web`.** `EmailDraft`/`EmailDraftEditableFields`
  (`apps/web/app/features/email/types/index.ts`) gain `quotedHtml: string
  | null` / `quotedText: string | null` (response-only; not added to the
  `UpdateEmailDraftRequest`/PATCH-writable shape). `EmailComposer.vue`:
  `useEmailComposeEditor` seeds from `draft.content` only.
  `buildContentFields()`/`buildSnapshot()` unchanged - still only read the
  live editor. **Reversed 2026-08-16:** this slice originally also added a
  collapsed-by-default block rendering `draft.quotedHtml` through
  `EmailContentIframe.vue` behind a "… show quoted text" toggle; that block
  was removed as redundant (see Decisions table and Scope §3) - the type
  fields and the rest of the slice stand.

Seam to watch: slice C and D must call the exact same `joinDraftContentWithQuote`
from slice B, not two independent concatenations that happen to agree -
same discipline `html-content-change-request.md` already required for
`buildReplyQuoteHtml` itself. Slice E must not add any client-side path
that PATCHes `quotedHtml`/`quotedText` - if a future feature wants the quote
editable, that's a new decision, not an accidental side effect of this one.

## Open points

None - all three open questions from the first draft of this document
(collapse/expand affordance, storage shape, iframe sizing) were decided by
Sven 2026-08-16 and are folded into the Decisions table above.
