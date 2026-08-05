# Unified media service + anydoc extraction (PRD)

> **Status: proposed** (2026-08-04). Phase 3 of the media library
> (prd.md, migration-prd.md). Decided with Sven: unify-and-stay-sync.
> One `@repo/media` package as the single source of truth for media
> domain logic, extraction swapped to `@firecrawl/anydoc`, pptx added,
> and one shared type registry so agent context documents accept every
> extractable type chat accepts.

Media domain logic currently lives in three places: `media.service.ts` in
apps/api, a deliberate duplicate of the refcount-delete helper in
packages/ai (a package cannot import an app), and direct repo calls in
apps/worker (sweep cron, gen-video `createMedia`). Document extraction is
split across three libraries (mammoth, read-excel-file,
@firecrawl/pdf-inspector) behind two separate sniffers with two separate
accepted-type sets. This PRD collapses all of it: one domain package, one
extraction engine, one type registry.

Extraction stays synchronous. anydoc is a Rust Node-API library that runs
conversions on the libuv threadpool, so the event loop is never blocked
(unlike today's pure-JS mammoth path). With the 10 MB cap this is the
same accepted trade-off as the synchronous dataset exports
(docs/datasets/export-and-row-reorder.md, decision "Generation is
synchronous"). Verified by spike (2026-08-04): anydoc's napi binding
loads and converts correctly under Bun.

## Goals

- New **`@repo/media`** package (scaffolded via `pnpm gen package`)
  owning: the media type registry (kinds, mime types, magic-byte
  sniffing, extractable flags), upload validation, storage placement
  (bucket/key choice), media row creation, extraction orchestration,
  refcounted deletion (`deleteMediaIfUnreferenced`), and the sweep query
  wrapper. Depends on `@repo/database`, `@repo/storage`, config, logger.
  Nothing depends on apps; `@repo/ai` may depend on `@repo/media`.
- **One extraction engine**: `@firecrawl/anydoc` for pdf, docx, pptx,
  xlsx, csv; UTF-8 passthrough for txt, md. Output is GitHub-flavored
  markdown. `mammoth`, `read-excel-file`, and `@firecrawl/pdf-inspector`
  are removed.
- **One type vocabulary: `MediaKind`** (renamed from `ChatMediaKind`,
  it is shared now), with two exported kind sets instead of a second
  category concept (Spatie's media library does the same, its
  `acceptsMimeTypes` takes plain lists): `IMAGE_KINDS` (png, jpeg,
  webp) and `DOCUMENT_KINDS` (pdf, docx, pptx, xlsx, csv, txt, md).
  Consumers accept sets, not hand-maintained lists: chat attachments
  accept both sets; agent context documents accept `DOCUMENT_KINDS`.
  That makes every extractable chat type an agent-context type
  automatically, including the new pptx and the previously chat-only
  xlsx/csv.
- **pptx** added as a supported document kind (ZIP magic + `.pptx`
  extension, same disambiguation as docx/xlsx).
- **apps/api Dockerfile moves to glibc**: `node:24-slim` build stages
  (matching apps/worker) and the Debian `oven/bun` runner. Build stages
  included so anydoc's install-time platform binary matches the runtime.
- The packages/ai duplicate refcount helper is deleted; apps/api's
  `media.service.ts` shrinks to chat-attachment orchestration and HTTP
  DTO building on top of `@repo/media`; the worker cron and gen-video
  processor call `@repo/media` instead of raw repos.
- Frontend ripple kept minimal: pptx joins the client accept list in
  `attachment-mime.ts`; everything else is unchanged.

## Non-goals

- Async/queued extraction. Deliberately not built; see decision 5 for
  the seam where it would go if extraction ever gets an OCR-class
  workload.
- OCR. anydoc has none built in; images therefore stay unextractable
  and out of agent context (confirmed by Sven). If OCR lands later
  (e.g. hosted Firecrawl Parse), image kinds get their extractable
  flag flipped and agent context adds `IMAGE_KINDS` to its accept
  list — two one-line changes, no interface changes.
  That is the "truly single interface" path, prepared but not walked.
- Migrating agent context documents onto the media table. Their
  exclusion (migration-prd.md) stands: they share the registry and the
  extraction engine, not the table or the refcount lifecycle.
- Enabling the further formats anydoc happens to read (odt, rtf, epub,
  legacy .doc/.xls). The accepted set stays deliberate; each addition is
  a registry entry away.
- Re-embedding existing agent-context chunks. New extractions produce
  markdown, old chunks stay raw text; replace-upload naturally converges
  a document.

## Design decisions

1. **Layering.** `@repo/storage` returns to being the dumb byte layer
   (buckets, objects, URLs, `getObjectStat`). Sniffing and extraction
   move out of it into `@repo/media`. `@repo/media` is the only package
   that knows what a "kind" is, which bucket a kind belongs in, and when
   an object may be deleted. Dependency direction:
   database/storage → media → (ai, apps).

2. **The registry is data, consumers are declarations.** One table
   keyed by `MediaKind`: magic-byte matcher, extensions, canonical
   mime, extractable flag, anydoc `Format` mapping. The two sniffers
   (`sniffChatMediaKind`, `sniffAgentContextDocumentKind`) merge into
   one `sniffMediaKind(buffer, filename, { accept })` where `accept`
   is a `readonly MediaKind[]` (named after the HTML file-input
   attribute with the same meaning), normally one of the exported
   sets. Agent context's current narrower behavior falls out of
   `accept: DOCUMENT_KINDS`; chat passes
   `accept: [...IMAGE_KINDS, ...DOCUMENT_KINDS]`. The per-feature
   caps (10 MB, agent-context's 25-doc limit) stay with the features.

3. **Extraction API.** `extractText({ buffer, kind }): Promise<string>`
   in `@repo/media`: anydoc `toMarkdownBytes` for pdf/docx/pptx/xlsx/csv
   (kind mapped to `Format` explicitly, never anydoc's own detection,
   csv has no content signature), passthrough for txt/md. The chat-side
   50k char cap stays in the chat orchestration, not the engine; agent
   context keeps extracting uncapped for chunking as today.

4. **Both extraction call sites switch, nothing moves between
   processes.** Chat attachments keep extracting synchronously in the
   API request; the agent-context worker job keeps extracting in the
   worker. Same engine, same registry, different processes, which is
   fine because the engine is a stateless function.

5. **The async seam, named now.** `extractText` is the single choke
   point every consumer goes through. If extraction ever needs to move
   behind the queue, the change is: an extraction-status field where the
   caller stores results, a job wrapping this one function, and caller
   UX for pending state. No caller reaches around the seam (no direct
   anydoc imports outside `@repo/media`), enforced by convention and
   review.

6. **Agent context gains xlsx/csv/pptx end to end.** Its upload
   validation accepts `DOCUMENT_KINDS`, `MIME_TYPE_BY_KIND` grows
   accordingly, and the extraction job handles the new kinds through the
   shared engine. The frontend's agent-context upload accept list widens
   to match. Existing docs are untouched.

7. **Tests follow the output change.** The `test/media` tier-2
   assertion (csv extractedText) now expects a markdown table; agent
   context extraction tests likewise. New sniff cases for pptx and for
   image-rejection under `['document']`.
