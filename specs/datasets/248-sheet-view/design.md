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

- The page top bar matches the document editor's: breadcrumb left; Export menu, Columns (column
  manager) and Settings right, with the same spacing and button style.
- Below it, on a `bg-stone-50` page (`px-4 pt-2 pb-4`), the sheet is one white card spanning the
  page width, like Fennel (`rounded-xl border border-stone-200`, no shadow, as `SettingsCard`):
  - **Heading bar** (`DatasetSheetToolbar`, `border-b`): table icon and dataset name left;
    Filter, Sort, Display right as ghost buttons with a count badge when active.
  - **Grid:** only as wide as its columns (`w-fit`), plain white to its right. The card hugs its
    height; the grid scrolls on both axes once it passes the available space.
  - **Footer** (`border-t`): a small `+` add-row button left, counts right ("N rows · M columns"
    or "X of N rows", `text-xs text-stone-500`).
- CSS grid of divs with `role="grid"`, `role="row"`, `role="columnheader"`, `role="gridcell"`,
  `aria-rowcount`, `aria-colcount` and `aria-selected` on the focused cell. Not a `<table>`:
  sticky pinned columns and a later virtualizer (#249) are simpler on a grid.
- Fixed row height (`h-9`). Text never wraps in display mode. Hairline `border-stone-200` lines.
- Header row stone-50 with a type icon (`TypeIcon`, `HashIcon`, `CalendarIcon`,
  `CircleChevronDownIcon`, `size-4 stroke-1.5 text-stone-500`) and the name, normal weight. The
  header sticks on vertical scroll; only the row-number column is pinned left (#251 for user
  pinning).
- Hover row: soft stone tint. Active cell: `bg-stone-50` with a 1px `ring-stone-500` inset ring.
  Editors inside the cell draw no border or ring of their own. No bold, no scaling.
- Numbers display through a cached `Intl.NumberFormat` per locale (`utils/formatNumber.ts`, up to
  20 fraction digits); editing uses the raw number.

## Adding rows and columns

- **Grid ends (US-1.5):** after the data rows comes one add-row row; after the data columns one
  fixed 44px add-column column. Both are tinted `bg-stone-50` (hover `bg-stone-100`) so they don't
  read as data. No filler rows or columns.
- **Add row (US-4.4):** the `+` in the add-row row, any cell of it, or the footer `+`. The row is
  created with empty data, kept visible under a filter, and once it appears in the refetch its
  cell opens for typing: the clicked column, or the first visible data column for the `+`
  buttons. `useDatasetSheetPendingEdit` owns this flow.
- **Keys typed while the row is created** are buffered on the document (printable keys and
  Backspace, no modifiers) and seed the editor draft (`utils/sheetDraftSeed.ts`: text as typed,
  number keeps digits, `.` and `-`, date and select ignore it). Enter is queued and commits once
  the editor opens. Escape or any pointerdown clears the buffer.
- **Add column (US-9):** the `+` header opens `DatasetSheetAddColumnPopover` (name, type, options
  for select). Saving appends `{ id: crypto.randomUUID(), name, type, options }` to
  `dataset.columns` via `useUpdateDataset`. Disabled at 20 columns (local constant, the web app
  can't import `MAX_COLUMNS_PER_DATASET`).

## Focus and scrolling

- Focusing the grid selects the first cell only on keyboard focus (`:focus-visible`), never on a
  mouse click into a non-focusable cell.
- Cells and editors focus with `preventScroll` and then `scrollIntoView({ block: 'nearest',
  inline: 'nearest' })`; the container's scroll padding keeps the sticky header and the pinned
  column from covering the cell.

## Row number column

- Shows the 1-based display position. On row hover, focus within the row, or while the menu is
  open, the number fades out and a `⋯` trigger fades in at the same spot. The trigger stays in
  layout (opacity, not `display: none`), so the menu keeps its anchor while it animates out.
- The menu: Expand, Move up, Move down, Delete. Shift+F10 or the ContextMenu key opens it for the
  active cell's row; focus returns to the cell on close. The trigger is `tabindex=-1`, so the grid
  stays one tab stop.
- The MCP marker (`PlugIcon`, tooltip) sits next to the number.
- Expand opens the existing `DatasetRowPanel`. Delete keeps the confirm dialog.

## View tools

- **Filter:** popover listing filter rows (column, operator, value) with add and remove, plus
  "Clear filters". A row only reaches the table once its value is complete.
- **Sort:** popover with column and direction, plus "Clear sort". Clicking a header also cycles
  ascending, descending, none.
- **Display:** popover with a switch per column.

## View state persistence

`useLocalStorage` (VueUse) keyed `dataset-view:<datasetId>`, holding `sorting`, `columnFilters`,
`columnVisibility` and `columnSizing`. Unknown column ids are dropped on load, so deleted columns
don't linger. Columns missing from `columnVisibility` are visible, which covers US-7.4.

## Files

| File                                                                 | Role                                            |
| -------------------------------------------------------------------- | ----------------------------------------------- |
| `composables/useDatasetSheet.ts`                                     | Table, edit state, view persistence, kept rows  |
| `composables/useDatasetSheetKeyboard.ts`                             | Keys, focus, commit and cancel                  |
| `composables/useDatasetSheetPendingEdit.ts`                          | Add row, then edit; keystroke buffer            |
| `utils/datasetSheetColumns.ts`                                       | Feature set, column defs, sort and filter fns   |
| `utils/datasetSheetDataColumns.ts`                                   | Data columns without `__row`                    |
| `utils/datasetSheetLayout.ts`                                        | Column width and pinning styles                 |
| `utils/parseCellValue.ts`                                            | Empty, valid or mismatch per column type        |
| `utils/sheetDraftSeed.ts`                                            | Editor draft from typed keys                    |
| `utils/focusActiveSheetCell.ts`                                      | Focus without scroll jumps                      |
| `utils/formatNumber.ts`                                              | Locale number display                           |
| `components/DatasetSheet.vue`                                        | Card, grid, header, footer                      |
| `components/DatasetSheetCell.vue`                                    | Display and editor per type                     |
| `components/DatasetSheetAddRow.vue`                                  | Add-row row                                     |
| `components/DatasetSheetRowMenu.vue`                                 | Row number, MCP marker, row menu                |
| `components/DatasetSheetToolbar.vue`                                 | Heading bar                                     |
| `components/DatasetSheet{Filter,Sort,Display}Popover.vue`            | View tools                                      |
| `components/DatasetSheetAddColumnPopover.vue`                        | Add column                                      |
| `components/DatasetDetail.vue`                                       | Mutations, row panel, asides; renders the sheet |
| `pages/dataset/[datasetId]/index.vue`                                | Top bar: breadcrumb, Export, Columns, Settings  |
| `DatasetGrid.vue`, `DatasetGridRow.vue`, `DatasetGridSelectCell.vue` | Deleted                                         |
| `i18n` locale files                                                  | Keys under `dataset.sheet`                      |
| `apps/web/e2e/dataset-sheet.spec.ts`                                 | One journey per story                           |
| `apps/docs/.../content/datasets.mdx`                                 | Sheet, view tools, mismatched values            |

All paths without a prefix are under `apps/web/app/features/dataset/`.

## Performance

Measured before the PR (1,000 rows by 20 columns, production build, headless Chromium): first
cell after 1.7 to 1.9 s, all rows after about 2.2 s, one long task of about 750 ms on load,
scrolling without long tasks. Row virtualization (#249) waits until that load matters.
