# Email Content: HTML/Text Instead of Markdown (change request)

> **Status: in-progress** (approved by Sven 2026-08-15; all slices below
> built the same day, apps/api suite 464 pass / 0 fail; confirmed by Sven,
> committed to `feat/email-client` (PR #21); still awaiting a manual
> browser pass through compose/reply/forward before this flips to
> `implemented`). Amends [prd.md](./prd.md)'s
> "Content pipeline" section and
> [drafts-change-request.md](./drafts-change-request.md)'s draft-content
> assumptions. Reverses the "markdown is canonical for everything" rule for
> storage, display, and compose; keeps markdown as an internal format for
> the LLM only.

## Why

The original content pipeline made markdown canonical everywhere: ingest
converted HTML to markdown, the web app rendered that markdown through
Tiptap, the compose editor was markdown-native, and drafts stored markdown.
`htmlBody` was persisted only as a conversion source, explicitly never
rendered by the UI.

That rule already broke in practice. Real newsletter and marketing HTML
does not survive markdown conversion as anything a recipient would call
"the email": layout, inline styling, and images degrade to plain
structured text. Sven started building the fix directly: render the
message's actual HTML, sandboxed and sanitized, instead of a markdown
approximation of it. That work is already on disk (see below) and this
change request extends it through the rest of the pipeline: storage,
compose, and drafts, so the whole feature agrees on one canonical
representation instead of two.

## Already built (Sven, uncommitted on `feat/email-client`)

The received-mail display path is done and is not part of this change
request's remaining scope:

- `EmailContentIframe.vue`: a sandboxed `<iframe>` with a strict inline
  `Content-Security-Policy` (`default-src 'none'`, scripts/objects/forms
  all blocked, images/fonts allowed over `https:`), a `ResizeObserver` to
  fit the iframe's height to content, and defensive base CSS so raw email
  HTML cannot break the surrounding page layout.
- `app/utils/dompurify.ts`: `sanitizeHtml` and `sanitizeHtmlForIframe`
  (`isomorphic-dompurify`, a new dependency), the latter allowing `<style>`
  (email HTML needs it) while forbidding scripts, forms, external
  stylesheets, and inline event handlers. A DOMPurify hook forces every
  link to `target="_blank" rel="noopener noreferrer"`.
- `app/plugins/dompurify.ts`: a `v-sanitize-html` directive for the same
  sanitizer outside the iframe case.
- `EmailMessageItem.vue`: renders `message.body.html` through
  `EmailContentIframe` instead of hydrating `message.body.markdown` into a
  read-only Tiptap instance.
- API: `getEmailThreadDetailForUser` now returns `body.html` alongside
  `body.markdown` in the thread-detail response.
- `@repo/editor`'s `createDocumentEditor` (`packages/editor/src/document-editor.ts`)
  is bimodal: a `contentType?: 'markdown' | 'html'` option, default
  `'markdown'` (document/task unaffected). `'html'` builds an instance with
  no `@tiptap/markdown` extension loaded at all (`kit.ts`'s
  `createDocumentEditorExtensions` only pushes `Markdown` when
  `hasMarkdown` is true), so `getMarkdown()` doesn't exist at runtime on an
  HTML-mode instance rather than silently mis-serializing. `onUpdate`
  reports `getHTML()` instead of `getMarkdown()` for that mode. This
  resolves section 2 below; nothing further needed in `@repo/editor`
  itself.

## Decisions

| Question                                                 | Decision                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the LLM (classify, draft agent) still use markdown? | Yes, unchanged. Markdown is a good format for an LLM to read and write; HTML is not.                                                                                                                                            |
| What's canonical for storage/display/compose?            | `htmlBody`. The PRD rule that it's "never rendered by the UI" is formally dropped.                                                                                                                                              |
| Is `textBody` (markdown) still persisted?                | Yes, unchanged, at the same ingest-time persist point. It remains the single source of truth the LLM reads; nothing re-derives markdown on demand.                                                                              |
| Compose editor                                           | Stays Tiptap. **Built**: `createDocumentEditor` gained a `contentType` option instead of a second factory; `@tiptap/markdown` stays a dependency, just conditionally loaded per instance.                                       |
| `email_drafts.content`                                   | Flips meaning from markdown to HTML.                                                                                                                                                                                            |
| Plain-text MIME alternative                              | New `email_drafts.text` column. Populated by the browser's `editor.getText()` for anything typed in Tiptap; by a new small HTML-to-text helper for the two producers that never touch a browser (AI draft push, quote seeding). |
| AI-generated drafts                                      | Agent still outputs markdown (prompt unchanged). Worker converts it once, at push time, via the already-built `markdownToHtml`, and stores the result as `content`.                                                             |
| Reply/forward quoting                                    | `buildReplyQuoteMarkdown` is replaced by an HTML quote builder: a `<p>` header plus the sanitized source HTML wrapped in `<blockquote>`.                                                                                        |

## Scope

### 1. Storage: `htmlBody` becomes canonical

No ingest change. `packages/mail/src/content/html-to-markdown.ts` keeps
computing both `textBody` (markdown, turndown) and the raw `htmlBody` at
persist time, same as today (`specs/email/prd.md`, "Sync model"). What
changes is which one the rest of the system treats as authoritative:
`htmlBody` for anything the user sees or edits, `textBody` for anything an
LLM reads. This section only formalizes what Sven's iframe work already
does for received mail; the remaining sections extend it to compose and
drafts.

### 2. Compose editor: switch `useEmailComposeEditor.ts` to HTML mode

**`@repo/editor` itself is done** (see "Already built"). What's left is
entirely in `apps/web/app/features/email/composables/useEmailComposeEditor.ts`
and its one caller, `EmailComposer.vue`:

- `createDocumentEditor({...})` call gains `contentType: 'html'`.
- `getMarkdown()` (currently calls the shared `getDocumentMarkdown(editor)`,
  which unconditionally calls `editor.getMarkdown()`) → **must** become
  `getHtml()` (`editor.getHTML()`) and a new `getText()`
  (`editor.getText()`, Tiptap's built-in doc-aware plain-text extraction,
  not a string-stripping function). This is not optional cleanup: once
  `contentType: 'html'` is set, the old `getDocumentMarkdown()` call throws
  at runtime, no `Markdown` extension is loaded on that instance. Both
  changes land in the same commit or the composer breaks the first time
  someone types.
- `setContent(markdown)` → `setContent(html, { contentType: 'html' })`.
  `SetContentOptions.contentType` defaults to `'json'` per call, not per
  instance, so this must be passed explicitly on every call, not just once
  at construction.

Every other command (toolbar formatting, tables, task lists, undo/redo)
is unaffected: they operate on the ProseMirror document, not on
markdown/HTML serialization.

### 3. `email_drafts`: `content` becomes HTML, new `text` column

`packages/database/src/schema/email.schema.ts`: `content` keeps its name
(avoids a rename across every call site that already says "content") but
its meaning flips to HTML. New column `text`, same nullability/default
shape as `content`, the plain-text MIME sibling.

Two producers, two derivations:

- **Browser-authored** (every keystroke autosave, every send): the client
  already owns a live Tiptap instance. `EmailComposer.vue` sends
  `{ content: getHtml(), text: getText() }` in the same PATCH/create/send
  payloads that today send `{ content: getMarkdown() }`.
- **Server-authored, no browser involved**: the AI draft push
  (`apps/worker/src/mail/email-draft.service.ts`) and the reply/forward
  quote seed on draft creation (`apps/api/src/services/email.service.ts`,
  `createEmailDraftForUser`). Neither has a Tiptap instance to call
  `getText()` on. `@repo/mail` gains a small HTML-to-text helper
  (`content/html-to-text.ts`, symmetric with `html-to-markdown.ts` and
  `markdown-to-html.ts`): strip tags, decode entities, collapse
  whitespace, preserve paragraph/line breaks. Not a library; this is a
  best-effort MIME fallback almost no recipient's client actually shows,
  the same bar `stripHtmlTags`'s existing resilient fallback in
  `html-to-markdown.ts` already sets.

`text` is always written whenever `content` is, by whichever of the two
paths is writing it, so the two can never drift relative to each other.
MIME assembly at send/push time reads both straight off the row; nothing
is derived at send time.

### 4. AI-generated drafts: markdown in, HTML stored

`apps/worker/src/mail/email-draft.service.ts`'s agent prompt is unchanged;
`DRAFT_TASK_INSTRUCTIONS` still asks for a markdown body only, no quote,
no subject, no signature, same reasoning as today (an LLM writes markdown
more reliably than HTML). What changes is the worker's own post-processing
in `pushDraftToGmail`: today it converts the agent's markdown to HTML only
for the outgoing MIME `html` part, storing the raw markdown as `content`.
Now the conversion happens once, up front:

```
agent output (markdown)
  → markdownToHtml() [already built, packages/mail/src/content/markdown-to-html.ts]
  → this becomes `content` (HTML) and, via the new html-to-text helper, `text`
  → the quote block (see below) is appended in HTML, not concatenated as a markdown string
```

The browser never receives markdown for an AI draft; by the time a user
opens one to review it, `content` is already HTML and the (now HTML-native)
composer just renders it.

### 5. Quoting: HTML blockquote replaces `buildReplyQuoteMarkdown`

`packages/mail/src/content/reply-quote.ts`'s `buildReplyQuoteMarkdown` (and
its `QUOTE_LINE_WRAP_LENGTH`/`QUOTE_MAX_LENGTH` constants, added for the
2026-08-15 freeze bug, see `specs/email/bugs.md`) is replaced by an HTML
equivalent with the same job: given the message being replied to or
forwarded, produce a quoted-history block to seed into the new draft.

- Header: `<p>On DATE, NAME wrote:</p>` (or the HTML-safe equivalent),
  same information the markdown version's header line carried.
- Body: the source message's sanitized HTML wrapped in `<blockquote>`.
  Sanitizing this is not optional: it is untrusted sender HTML about to be
  embedded into a draft the user edits and sends themselves. `@repo/mail`
  gets its own sanitizer (`content/sanitize-html.ts`, `isomorphic-dompurify`
  works server-side too, not just in the browser), configured **identically**
  to `apps/web/app/utils/dompurify.ts`'s `sanitizeHtmlForIframe`: same
  `FORBID_TAGS`/`FORBID_ATTR` lists, same link-hardening hook.
  **Deliberately mirrored, not consolidated** (decided 2026-08-15, revisit
  later if it drifts): `apps/web` already depends on `@repo/mail` and
  `@repo/mail/content` is its own tree-shakeable subpath export, so a single
  shared export (`apps/web` importing it instead of keeping its own copy)
  is technically straightforward, not blocked by a dependency-direction
  constraint. Sven chose to keep the two copies for now anyway. Two
  independent sanitizer configs that are supposed to agree are worse than
  one; keeping them byte-identical is a review discipline this decision
  accepts, not a technical necessity. If web's config changes later, mail's
  must change with it, by hand.
- Size protection, carried over from the freeze-bug fix but adapted to
  HTML: still caps total quoted size and still needs to handle
  pathologically-shaped input, but truncation must cut on a tag boundary,
  not mid-line, so it can't be the same regex-based line-wrap. A closing
  `</blockquote>` (and any other unclosed tags) must always be restored
  after a cut, or the truncated quote corrupts the rest of the draft's DOM
  when Tiptap parses it.

Both call sites that build a reply/forward draft's initial `content`
(`createEmailDraftForUser` in `apps/api`, and `pushDraftToGmail` in
`apps/worker` for an AI draft) move to this one helper, same as today's
single shared markdown version.

### 6. Outgoing MIME assembly

`SendMailInput.html`/`.text` (the actual wire format at send time,
`packages/mail/src/provider/mail-provider.ts`) does not change shape; it
already took `html`/`text` directly. What changes is where those values
come from:

- Final `/send` and `/draft/:draftId/send`: `content`/`text` read straight
  off the (now-HTML) draft row or the request body, same as `draft.content`
  is read today, just no longer markdown.
- Draft push/write-back (`buildDraftSendMailInput` in `apps/api`,
  `pushDraftToGmail` in `apps/worker`): `html: draft.content`, `text:
  draft.text`. `markdownToHtml` stops being called on every write-back
  (today's `markdownToHtml(draft.content)`); it is only still called once,
  by the worker, when the agent's markdown output first becomes a draft
  (see section 4).

## What becomes dead code

- `buildReplyQuoteMarkdown`, `QUOTE_LINE_WRAP_LENGTH`, `QUOTE_MAX_LENGTH`
  (`content/reply-quote.ts`).
- `useEmailComposeEditor.ts`'s `getMarkdown()`.
- `@tiptap/markdown`'s `contentType: 'markdown'` codepath as it applies to
  email specifically (the extension itself is not removed; document/task
  keep using it).
- The oversized-content composer guard built for the freeze bug
  (`email-draft-safety.ts`'s line-length check) needs re-evaluating once
  quoting no longer produces a single giant line by construction. Received
  HTML can still be pathological in its own ways (deeply nested tables,
  huge inline `style` blocks), so this likely becomes an HTML-shaped
  version of the same guard rather than disappearing outright. Decide
  during implementation, not assumed here.

## Non-goals

- No change to the classifier or draft agent's prompts, inputs, or model
  choice. This is a storage/display/compose change, not an AI change.
- No change to `textBody`/ingest. Still computed once, still what the LLM
  reads.
- No rewrite of already-stored message bodies. Existing rows keep whatever
  `htmlBody`/`textBody` they have; nothing here triggers a backfill.
- Not attempting perfect plain-text fidelity (list bullets, table layout)
  in the new MIME `text` fallback. It is a compatibility floor, not a
  rendering target; almost no recipient's client shows it.

## Delivery slices

Two waves, same pattern as the drafts change request. `@repo/editor` is
already done (see "Already built") and is not a slice.

**Wave 1 (parallel, no shared files)**

- **A — `@repo/mail`.** `content/html-to-text.ts` (new small stripper),
  `content/sanitize-html.ts` (new, mirrors `apps/web/app/utils/dompurify.ts`'s
  `sanitizeHtmlForIframe` config exactly), and the HTML quote builder in
  `content/reply-quote.ts` replacing `buildReplyQuoteMarkdown` (keep the
  file, replace its contents; delete `QUOTE_LINE_WRAP_LENGTH`/
  `QUOTE_MAX_LENGTH`, add HTML-safe equivalents that cut on a tag boundary).
  `markdownToHtml` is unchanged, just gets a new caller (slice C).
- **B — `@repo/database`.** `email_drafts` gains a `text` column
  (`packages/database/src/schema/email.schema.ts`), `email-draft.repo.ts`'s
  `UpdateEmailDraftFields` widens to include it. `content`'s column itself
  is unchanged (still `text('content')`); only its _meaning_ flips, which
  is a documentation/comment change, not a schema change.

**Wave 2 (parallel, after wave 1 lands)**

- **C — `apps/api`.** `createEmailDraftForUser`'s quote seed switches to
  the new HTML quote builder; `PATCH /email/draft/:draftId` validation and
  service accept `text`; the write-back MIME assembly
  (`buildDraftSendMailInput`) reads `html: draft.content, text: draft.text`
  directly instead of calling `markdownToHtml` on every write-back. Extend
  `test/email/drafts.test.ts` for the new quote shape and the `text` field.
- **D — `apps/worker`.** `pushDraftToGmail` converts the agent's markdown
  output once via the existing `markdownToHtml` plus the new
  `htmlToText`, storing both as `content`/`text`; the quote block is
  appended via the same HTML quote builder slice A built, not concatenated
  as a markdown string. Agent prompt (`DRAFT_TASK_INSTRUCTIONS`) is
  unchanged.
- **E — `apps/web`.** `useEmailComposeEditor.ts`'s switch to
  `contentType: 'html'` (section 2, including the `getMarkdown()` →
  `getHtml()`/`getText()` fix, in the same change). `EmailComposer.vue`'s
  snapshot/send payloads move from `{ content: getMarkdown() }` to
  `{ content: getHtml(), text: getText() }`. Types
  (`EmailDraft.text`, `EmailDraftEditableFields.text`) and
  `useEmailDraftApi.ts`'s PATCH payload gain `text`. The oversized-content
  guard (`email-draft-safety.ts`) keeps its existing line-length check,
  now run against `content` as HTML rather than markdown; do not build an
  HTML-nesting-depth analyzer for this pass, that is out of scope (see
  "Open points").

Seam to watch: slice C and D must call the exact same quote-builder
function from slice A, not two independent HTML-assembly implementations
that happen to look similar. Slice E must not touch the guard's shape
beyond what "run the same check against HTML" requires.

## Open points

- Exact shape of the new HTML-native construction path in `@repo/editor`:
  a second exported factory, or a parameter on the existing one. Decide
  during implementation; either is a small, contained change.
- Whether the oversized-content composer guard needs an HTML-specific
  successor, and what "pathological" means for HTML rather than a single
  long line (see "What becomes dead code" above).
- `email_drafts.text`'s exact column constraints (nullable? default `''`?)
  should mirror whatever `content` already does, to be settled when the
  migration is written, not decided in this document.
