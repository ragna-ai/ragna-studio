# Dataset sheet view (design)

> Design for [prd.md](./prd.md), issue #248.

Frontend only (`apps/web`, `features/dataset`). No API, schema or package changes. No new
dependencies: `@tanstack/vue-table` 9.3.1 is already installed.

## Table setup

One `useTable` instance in a `useDatasetSheet(dataset, rows)` composable. Features, all from
`@tanstack/vue-table` v9:

| Feature                                             | Used for                          | Stories |
| --------------------------------------------------- | --------------------------------- | ------- |
| `rowSortingFeature` + `createSortedRowModel`        | Sort, one column at a time        | US-5    |
| `columnFilteringFeature` + `createFilteredRowModel` | Typed filters                     | US-6    |
| `columnVisibilityFeature`                           | Display menu                      | US-7.1  |
| `columnSizingFeature`, `columnResizingFeature`      | Drag to resize                    | US-7.2  |
| `columnPinningFeature`                              | Row number pinned left            | US-1.2  |
| `cellSelectionFeature`                              | Active cell, arrow keys, tabindex | US-2    |

- `getRowId: (row) => row.id`. Never the index: sort and filter change indexes.
- Column defs are built from `dataset.columns`. `meta` carries the `DatasetColumn` (type,
  options). A leading `__row` column renders the row number and menu.
- `cellSelectionFeature` options: `enableCellRangeSelection: false`,
  `enableMultiCellRangeSelection: false`, `enableCellSelectionDrag: false`. Single active cell
  only.
- **`autoResetCellSelection: false`.** Its default resets the selection whenever `data` changes.
  Every save refetches rows, so the default would drop the active cell after each edit.
- Sorting: `sortUndefined: 'last'` and a per-type `sortingFn` (text with `localeCompare`, number,
  ISO date string, select by option order). Covers US-5.2.
- Filtering: one `filterFn` per column type. Filter value shape:
  `{ op: 'contains' | 'eq' | 'lt' | 'gt' | 'on' | 'before' | 'after' | 'anyOf', value }`.
- No sort and no filter means the row model is the saved order from the API, so "move up/down"
  only shows when `sorting` and `columnFilters` are both empty (US-4.3).

## Cells and editors

Every cell renders as plain text in display mode. **Only the active cell in edit mode mounts an
editor.** This also answers how select dropdowns render: TanStack Table has no editors or
dropdowns. It only hands each cell its column `meta`. A `DatasetSheetCell` switches on
`meta.type`:

| Type   | Display                | Editor (mounted only while editing)                  |
| ------ | ---------------------- | ---------------------------------------------------- |
| text   | one line, truncated    | auto-growing `Textarea` overlay, wider than the cell |
| number | right aligned, tabular | `Input type="number"`                                |
| date   | locale formatted       | `Input type="date"`                                  |
| select | stone pill             | `Select` opened at mount (`default-open`), as today  |

So at most one reka `SelectRoot` exists at a time, replacing the per-cell lazy trick in
`DatasetGridSelectCell`. That file is removed.

Edit state lives in the composable: `editingCell: { rowId, columnId } | null` plus a draft value.

- Enter, F2 or double-click opens the editor with the current value. A printable key opens it
  with that key as the draft (US-3.1).
- Enter (not Shift+Enter in text) and Tab commit, then move down or right. Blur commits.
  Escape discards (US-3.2, US-3.3).
- Delete or Backspace on an active, non-editing cell saves `null` (US-3.4).
- Commit calls the existing `useUpdateDatasetRow`, no optimistic update. On error the cell keeps
  showing the query's value and a toast reports the error (US-3.5).
- Unchanged drafts don't send a request.

## Column type changes

Users change a column's type in the column manager at any time. Stored values are not converted:
the API validates values only on write (`validateRowData`). So the sheet treats the type as live
data, and every stored value as possibly not fitting it.

- Column defs are a `computed` over `dataset.columns`. After the column manager saves, the dataset
  query refetches and every cell switches renderer and editor (US-8.1). Column ids never change,
  so active cell, widths and visibility survive.
- One pure helper, `parseCellValue(column, raw)`, returns `{ kind: 'empty' }`,
  `{ kind: 'valid', value }` (typed: number, ISO date, option) or `{ kind: 'mismatch', raw }`.
  Display, sort and filter all go through it, so they agree on what "fits" means. Mirrors the
  rules of `validateValueForColumn`, with one stricter rule: a date must be `yyyy-mm-dd`. The API
  only requires a string, so a text column turned into a date would otherwise show "Invalid Date".
- Mismatch display: the raw value as text in `text-stone-500`, with a small `CircleAlertIcon`
  (amber, `size-3.5`) and a tooltip "Doesn't match the column type" (US-8.2).
- Mismatch edit: the typed editor opens empty with the raw value as placeholder. Escape
  discards. Saving writes a fitting value (US-8.3).
- `sortingFn`: valid values compared by type, then mismatches (as text), then empty (US-8.4).
- `filterFn`: mismatch and empty never match (US-8.4).
- Rows the user edits or adds while a filter is active go into a `keptRowIds` set in the
  composable. Every `filterFn` returns `true` for a kept row. The set clears whenever
  `columnFilters` changes (US-6.5). Rows written by others (agent, MCP) get no such exemption.
- Each stored filter keeps the `columnType` it was built for: `{ columnType, op, value }`. A
  filter whose `columnType` differs from the column's current type is dropped, both on load and
  when `dataset.columns` changes (US-8.5). Sort needs no such guard: it re-sorts with the new
  type's `sortingFn`.

## Layout and look

- CSS grid of divs with `role="grid"`, `role="row"`, `role="columnheader"`, `role="gridcell"`,
  `aria-rowcount`, `aria-colcount` and `aria-selected` on the focused cell. Not a `<table>`:
  sticky pinned columns and a later virtualizer (#249) are simpler on a grid.
- Fixed row height (`h-9`). Text never wraps in display mode.
- White panel on the stone-50 page, hairline `border-stone-200` grid lines, no card shadow (same as
  `SettingsCard`). Header row stone-50 with a type icon (`TypeIcon`, `HashIcon`, `CalendarIcon`,
  `CircleChevronDownIcon`, `size-4 stroke-1.5 text-stone-500`) and the name, normal weight.
- Hover row: soft stone tint. Active cell: 2px ring in the primary colour, inset. No bold, no
  scaling.
- Header and pinned columns are `position: sticky` with a solid background.
- Grid ends (US-1.5): after the data rows comes one add-row row: `+` in the row-number column,
  the whole row is the click target (aria-label `dataset.sheet.addRow`). After the data columns
  comes one add-column column: `+` in its header opens `DatasetSheetAddColumnPopover`; its body
  cells are empty and it is a fixed 44px wide. No filler rows or columns. See the card layout
  below.
- The sheet is one white card spanning the page width, like Fennel: a heading bar (table icon +
  dataset name left; Filter, Sort, Display right; `border-b`), the grid, and a footer bar
  (`border-t`, a small `+` add-row icon button left, counts right: "N rows · M columns" or "X of N rows", `text-xs text-stone-500`).
  The grid inside is only as wide as its columns (`w-fit`), plain white to its right. The card
  hugs its height and the grid scrolls once it passes the available space.
- Add row (US-4.4): creates the row with empty data, calls `keepRowVisible`, focuses its first
  data cell. Disabled while in flight.
- Add column (US-9): saving appends `{ id: crypto.randomUUID(), name, type, options }` to
  `dataset.columns` via the existing `useUpdateDataset`. Disabled at 20 columns.
- Spacing: the toolbar sits close to the grid (`gap-2`), and the page padding matches the top
  bar's `px-4`.
- The page area around the panel is `bg-stone-50`, like the document editor.

## Row number column

- Shows the 1-based display position. On row hover the number swaps for a `⋯` trigger opening a
  `DropdownMenu`: Expand, Move up, Move down, Delete.
- The MCP marker (`PlugIcon`, tooltip) sits next to the number.
- Expand opens the existing `DatasetRowPanel`. Delete keeps the confirm dialog.

## Toolbar

- The page top bar matches the document editor's: breadcrumb left; Export menu, Columns
  (column manager) and Settings right, with the same spacing and button style.
- A sheet toolbar row above the grid holds Filter, Sort and Display as ghost buttons, each with
  a count badge when active.
- **Filter:** popover listing filter rows (column, operator, value) with add and remove, plus
  "Clear filters".
- **Sort:** popover with column and direction, plus "Clear sort". Clicking a header also cycles
  ascending, descending, none.
- **Display:** popover with a switch per column.

## View state persistence

`useLocalStorage` (VueUse) keyed `dataset-view:<datasetId>`, holding `sorting`, `columnFilters`,
`columnVisibility` and `columnSizing`. Unknown column ids are dropped on load, so deleted columns
don't linger. Columns missing from `columnVisibility` are visible, which covers US-7.4.

## Files

| File                                                                 | Change                                         |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `composables/useDatasetSheet.ts`                                     | New: table, edit state, view persistence       |
| `utils/datasetSheetColumns.ts`                                       | New: column defs, sort and filter fns per type |
| `utils/parseCellValue.ts`                                            | New: empty, valid or mismatch per column type  |
| `components/DatasetSheet.vue`                                        | New: grid, header, footer, keyboard handling   |
| `components/DatasetSheetCell.vue`                                    | New: display and editor per type               |
| `components/DatasetSheetRowMenu.vue`                                 | New: row number, MCP marker, row menu          |
| `components/DatasetSheetToolbar.vue`                                 | New: Filter, Sort, Display, export, columns    |
| `components/DatasetSheetFilterPopover.vue`                           | New                                            |
| `components/DatasetDetail.vue`                                       | Uses `DatasetSheet` instead of `DatasetGrid`   |
| `pages/dataset/[datasetId]/index.vue`                                | Header keeps the breadcrumb only               |
| `DatasetGrid.vue`, `DatasetGridRow.vue`, `DatasetGridSelectCell.vue` | Deleted                                        |
| `i18n` locale files                                                  | New keys under `dataset.sheet`                 |
| `apps/web/e2e/dataset-sheet.spec.ts`                                 | New                                            |
| `apps/docs/.../content/datasets.mdx`                                 | "Edit rows in the grid" rewritten              |

All paths without a prefix are under `apps/web/app/features/dataset/`.

## Risks

- `cellSelectionFeature` is new in v9. If it fights the single-cell model, fall back to our own
  `activeCell` ref with `table.getRowModel()` for neighbours. The rest of the design is unchanged.
- First render of 20,000 text cells is unmeasured. Check with a seeded 1,000 by 20 dataset before
  the PR, and cite the result there. Slow means #249.
