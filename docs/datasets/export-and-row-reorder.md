# Export (datasets and documents) and manual dataset row reorder

**Status: implemented (2026-07-22); user verification and commit pending.**

Related: [datasets.md](./datasets.md) (the base feature; this builds on its schema, tools, and grid), [../tasks/prd.md](../tasks/prd.md) (the move pattern this mirrors), [../documents](../documents) (future consumer of the export seam).

## Problem

Two gaps in datasets v1:

1. **No way out.** A dataset's data lives only in the grid. There is no way to hand it to someone outside the app, attach it to a report, or open it in a spreadsheet. Documents will want the same thing later (export, and eventually import), so the answer must not be a dataset-only dead end.
2. **Order is frozen at creation.** The 2026-07-21 fix gave rows a fractional-index `sort_order`, but nothing can change it after creation. A human can't rearrange a plan in the grid. An agent can't reprioritize its own queue. The infrastructure for both exists; only the operations are missing.

## Scope

**In:**

- Server-side export of a dataset as CSV, Excel (xlsx), PDF, or Markdown, via a new `@repo/export` package.
- Manual row reordering: up/down buttons in the grid, a `POST .../move` endpoint, and a `datasetMoveRow` agent tool.

**Out (deliberately):**

- **Import.** Designed for (parsers will live in `@repo/export` next to the writers; candidates are `read-excel-file` or `officeParser`, see decision 2), ships later, together with the documents story.
- ~~**Document export.**~~ Pulled into scope on 2026-07-22, see the "Document export" section below.
- **A generic `/export` endpoint** (`{ resourceType, resourceId, format }`). Rejected: datasets and documents share no access logic and no formats. A generic endpoint would be a switch statement re-implementing each controller's checks, against the thin-controller rule. Per-resource routes + one shared generation package instead.
- **Column-value sorting** (header click, `sortBy` in `datasetListRows`). Different feature; may come later.
- **Drag-and-drop reorder.** Up/down buttons match the column manager and add no dependency.
- **Agent-triggered export.** Export is a human act, not a ledger operation. The tool family does not grow an export tool.

## User experience

**Export:** the dataset detail page header gains an "Export" dropdown (CSV / Excel / PDF / Markdown). Clicking an entry downloads the file immediately; no dialog, no options. The file contains what the grid shows: data columns only (headers are column names), rows in grid order, soft-deleted rows excluded, no `createdAt`/`updatedAt`. Filename: `<dataset-name-slug>-<yyyy-mm-dd>.<ext>`.

**Reorder:** each grid row shows ArrowUp/ArrowDown icon buttons on hover, next to the existing expand toggle, matching the column manager's convention (`DatasetColumnManager.vue`). First row's up and last row's down are disabled. A move persists immediately and the grid re-renders in the new order.

**Agents:** the datasets toggle now enables seven tools. `datasetMoveRow` lets an agent reprioritize: "move the research step before the drafting step" becomes one tool call. No new toggle or config.

## Design decisions

1. **Export seam: per-resource routes, shared package.** New route `GET /:datasetId/export?format=csv|xlsx|pdf|md` in `dataset.controller.ts`, same access check as every other dataset route (workspace container). Generation lives in a new **`@repo/export`** package (scaffolded via `pnpm gen package`) so documents can reuse it later and all heavy dependencies live in one place. The package exposes a `TabularExport` input (`{ title, columns: Array<{ name: string; type: DatasetColumnType }>, rows: Array<Array<string | number | null>> }`) and four writers returning `Uint8Array` plus content type. Mapping dataset → `TabularExport` (resolve values by column id, order by `sort_order`, drop deleted rows) happens in `dataset.service.ts`, not in the package: the package knows formats, not datasets.

2. **Format specifics.**
   - **CSV:** hand-rolled (~20 lines): comma separator, RFC 4180 quoting, `\r\n` line endings, UTF-8 with BOM so Excel opens umlauts correctly. Numbers unformatted, `null` as empty string. No dependency.
   - **Excel:** `write-excel-file` (MIT, actively maintained, schema-based writer, zips via `fflate`). Chosen over `exceljs` (last release 2023, unmaintained), SheetJS CE (npm registry frozen at a CVE-carrying 0.18.5; current releases only via their own CDN tarball, and styling is paywalled in Pro), and `officeParser` (read/convert only, cannot author files). One worksheet named after the dataset, bold header row, `number` columns written as numeric cells, everything else as text. For future import, the same author's `read-excel-file` or `officeParser` (structured xlsx parsing, active as of v7.4.0) are the candidates.
   - **PDF:** `pdfmake` (MIT). Title, export date, then one table with a repeating header row and text wrapping. Landscape when the dataset has more than 6 columns. Uses pdfmake's bundled Roboto vfs fonts; no font files added to the repo.
   - **Markdown:** hand-rolled, no dependency. `# <dataset name>` heading, blank line, then a GFM table: header row from column names, `---` separator row, one line per row. Cell escaping: `|` becomes `\|`, newlines become `<br>`. `null` as empty cell, numbers unformatted. UTF-8, `.md` extension, content type `text/markdown; charset=utf-8`. Chosen because documents treat markdown as canonical, so this doubles as the natural "dataset to document" bridge later.
   - **Date formatting (decided 2026-07-22):** `date` column values (stored as ISO `yyyy-mm-dd`) are rendered European style, `dd.mm.yyyy`, in every export format. Hardcoded for now; locale-aware formatting may come later. The PDF's export-date line uses `dd.mm.yyyy HH:mm`. Unparsable values pass through as stored. Filenames keep ISO `yyyy-mm-dd` so they sort correctly.
   - **Generation is synchronous in the request, accepted trade-off (documented 2026-07-22).** There is no background job. The xlsx zip, pdf layout, and docx packing are CPU-bound and run on the Node event loop, so concurrent API requests wait during that burst. The guardrails make the worst case small (1,000 rows × 20 columns, PDF cells capped at 500 chars, documents are one markdown text): tens of milliseconds, low hundreds for a maxed-out PDF, once per export click. Imperceptible in a single-user app. If caps grow or exports become frequent/automated, the escape hatches are a BullMQ job in `apps/worker` delivering via notification + R2 link, or `worker_threads` in the API. Neither is built now.

3. **Download mechanics in the SPA.** The web app fetches the export with the existing authenticated API client as a blob and triggers the download via a temporary object URL. No `window.open` (the API is a different origin/port in dev; the client already carries credentials).

4. **Move: repo layer mirrors `moveTask`.** New `moveDatasetRow({ datasetId, userId, rowId, afterRowId })` in `dataset.repo.ts`. `afterRowId` omitted/null means "move to top", otherwise the row lands directly after `afterRowId`; the new key is `generateKeyBetween(after, next)` (same resolution logic as `resolveMoveSortOrder` in `task.repo.ts`). The whole move runs in a transaction that locks the parent dataset row (`SELECT ... FOR UPDATE`), the same lock `createDatasetRow` takes, so moves serialize against concurrent appends and against each other and sort keys never collide. Moving a row bumps its `updatedAt` (consistent with "when was this row last touched"). `afterRowId` must reference a non-deleted row of the same dataset, otherwise error.

5. **Move: API mirrors the task route.** `POST /:datasetId/row/:rowId/move` with body `{ afterRowId?: string | null }`, next to the existing row routes. A dedicated action, not part of the row PATCH: updating cell data and repositioning are different intents (same reasoning as tasks, `task.controller.ts`).

6. **Move: seventh agent tool.** `datasetMoveRow({ datasetId, rowId, afterRowId? })`, flat `z.object` (repo rule: no top-level unions). Wrapped in the same per-dataset in-process FIFO lock as `datasetAppendRow`, acquired synchronously before the first `await`, so a multi-move turn applies in the model's intended order. The lock helper in `dataset.tools.ts` is shared between append and move, keyed by `datasetId`. Tool descriptions updated: `datasetListRows` now says rows come back in "dataset order (creation order unless rearranged)".

7. **No optimistic reordering in the grid.** Click → `POST .../move` → refetch rows. The dataset detail already reloads all rows in one call; at ≤1,000 rows this is simpler than mirroring fractional keys client-side. If it ever feels sluggish, optimistic swap is a drop-in refinement.

## Changes by package

| Area | Change |
| --- | --- |
| `@repo/export` (new) | Scaffold via `pnpm gen package`. `TabularExport` type, `toCsv`, `toXlsx`, `toPdf`, `toMarkdown` writers with content types. Deps: `write-excel-file`, `pdfmake`. |
| `@repo/database` | `moveDatasetRow` in `dataset.repo.ts` (dataset-lock transaction, `generateKeyBetween`). No schema change, no db:push. |
| `@repo/ai` | `datasetMoveRow` tool in `dataset.tools.ts`; FIFO lock helper shared with `datasetAppendRow`; description touch-ups. |
| `apps/api` | `dataset.controller.ts`: export route + move route. `dataset.service.ts`: dataset → `TabularExport` mapping, filename slug, move passthrough. |
| `apps/web` | Export dropdown on the detail page (blob download via API client), row hover up/down buttons in `DatasetGrid.vue`, `useDatasetApi` additions, i18n (`de-DE`, `en-UK`). |

## Document export (scope addition, 2026-07-22)

Documents get the same per-resource export seam. A document's `content` is canonical markdown ([../documents](../documents)), so every format derives from one parse.

**Formats:** Markdown, plain text, PDF, Word (docx).

**UX:** the document editor page header gains the same "Export" dropdown (Markdown / Text / PDF / Word). Same immediate blob download, filename `<document-title-slug>-<yyyy-mm-dd>.<ext>`.

**Decisions:**

1. **Route:** `GET /:documentId/export?format=md|txt|pdf|docx` in `document.controller.ts`, same access checks as the existing document routes. Mapping and filename logic in `document.service.ts`, controller stays thin.
2. **`@repo/export` gains a `DocumentExport` input** (`{ title, markdown }`) and four writers. One shared markdown parse feeds three of them: `marked`'s lexer produces the token tree, and the text, PDF, and docx writers walk the same tokens. No second parser, ever.
   - **Markdown:** `# <title>` heading, blank line, then the stored content verbatim. No dependency.
   - **Text:** token walk that strips formatting but keeps structure: headings as plain lines with blank lines around them, list markers (`-` / `1.`) preserved, code blocks verbatim, links as `text (url)`.
   - **PDF:** `pdfmake` (consistent with dataset export, decided over HTML-print via the webbrowser service). Token-to-content mapping: headings h1-h6, paragraphs with bold/italic/inline code, ordered/unordered lists incl. nesting, blockquotes, code blocks, horizontal rules, links (colored, with URL), markdown tables as pdfmake tables. Unknown or unsupported constructs degrade to their plain text, never an error.
   - **Word:** the `docx` package (MIT, actively maintained). Same token walk mapped to `Paragraph`/`TextRun`/`HeadingLevel`/table nodes, same degrade-to-text rule. Content type `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
3. **Empty document:** allowed, exports a title-only file (same rule as empty datasets).
4. **New deps in `@repo/export` only:** `marked`, `docx`. Nothing new in the apps.

**Changes:** `@repo/export` (`DocumentExport` + four writers, deps `marked` + `docx`), `apps/api` (document export route + service mapping), `apps/web` (export dropdown on the document editor page, `useDocumentApi` addition, i18n `de-DE` / `en-UK`).

## Open questions (to resolve at implementation)

1. **PDF cell truncation.** A cell can hold very long text (the reason `DatasetRowPanel` exists). Proposal: cap a PDF cell at ~500 characters with an ellipsis, so one essay-length cell can't stretch the table across pages. CSV and xlsx always carry full values.
2. **Empty dataset export.** Proposal: allowed; the file contains just the header row (PDF: title + empty table note). Cheaper than a disabled-button special case.
