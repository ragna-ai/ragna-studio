# Dataset sheet view (slices)

> Build plan for [prd.md](./prd.md) and [design.md](./design.md), issue #248.
>
> Build record. The design changed during review (heading bar, "+" last row and column, footer
> counts). [design.md](./design.md) describes what was built; the contracts below are the
> originals.

Every slice follows AGENTS.md and loads the clean-code skill. Frontend only, so no tdd skill.
All paths without a prefix are under `apps/web/app/features/dataset/`.

## Order

1. **A (core)** alone. It fixes the contract below in code.
2. **B (sheet)** and **C (toolbar)** in parallel, against A's contract.
3. **D (e2e and docs)** after B and C.

## Shared rules

- Only slice A edits `apps/web/i18n/locales/en-UK.json` and `de-DE.json`. B and C use the keys
  below. A key they miss goes into their report, not into the locale files.
- No new dependencies. `@tanstack/vue-table` is v9: `useTable`, `tableFeatures`, `*Feature`
  objects and `create*RowModel` factories. Check its `.d.ts` files, not v8 docs.
- Nobody runs docker commands. If Postgres or Redis is down, stop and report.
- Every slice runs `pnpm check-types` and `pnpm lint` before reporting.

## Contract (owned by A)

```ts
// utils/parseCellValue.ts
export type ParsedCellValue =
  | { kind: 'empty' }
  | { kind: 'valid'; value: string | number }
  | { kind: 'mismatch'; raw: string };
export function parseCellValue(column: DatasetColumn, raw: unknown): ParsedCellValue;

// utils/datasetSheetColumns.ts
export type DatasetFilterOp = 'contains' | 'eq' | 'lt' | 'gt' | 'on' | 'before' | 'after' | 'anyOf';
export interface DatasetSheetFilter {
  columnType: DatasetColumnType;
  op: DatasetFilterOp;
  value: string | number | string[];
}
export const ROW_NUMBER_COLUMN_ID = '__row';
export function filterOpsFor(type: DatasetColumnType): DatasetFilterOp[];

// composables/useDatasetSheet.ts
export interface SheetCell {
  rowId: string;
  columnId: string;
}
export interface UseDatasetSheetOptions {
  dataset: MaybeRefOrGetter<Dataset>;
  rows: MaybeRefOrGetter<DatasetRow[]>;
  onUpdateCell: (rowId: string, columnId: string, value: string | number | null) => Promise<void>;
}
export interface UseDatasetSheetResult {
  table: DatasetSheetTable; // VueTable with the features from design.md
  hasActiveView: ComputedRef<boolean>; // sorting or filters set: move up/down hidden
  totalRowCount: ComputedRef<number>;
  visibleRowCount: ComputedRef<number>;
  editingCell: Ref<SheetCell | null>;
  draft: Ref<string>;
  startEditing: (cell: SheetCell, initialDraft?: string) => void;
  commitEdit: () => Promise<void>; // no request if unchanged; keeps row visible (US-6.5)
  cancelEdit: () => void;
  clearCell: (cell: SheetCell) => Promise<void>;
  keepRowVisible: (rowId: string) => void; // used after "add row"
  clearView: () => void; // clears sort and filters
}
```

`DatasetSheetTable` is an exported type alias. B and C read sort, filter, visibility, sizing and
selection state through `table` only.

## i18n keys (added by A, under `dataset.sheet`)

`addRow`, `empty.noRows`, `empty.noColumns`, `empty.openColumns`, `noMatches`, `clearFilters`,
`count.all` ("{rows} rows · {columns} columns"), `count.filtered` ("{visible} of {total} rows"),
`mismatch` ("Doesn't match the column type"), `rowMenu.open`, `rowMenu.expand`,
`rowMenu.moveUp`, `rowMenu.moveDown`, `rowMenu.delete`, `rowMenu.moveDisabled` ("Clear sort and
filters to move rows"), `toolbar.filter`, `toolbar.sort`, `toolbar.display`, `sort.ascending`,
`sort.descending`, `sort.clear`, `filter.add`, `filter.remove`, `filter.value`, `filter.op.<op>`
for every `DatasetFilterOp`, `display.title`, `resizeColumn` ("Resize {column}"). The old
`dataset.grid.*` keys stay until D, which removes the unused ones.

## Slices

### A: core

- **Owns:** `utils/parseCellValue.ts`, `utils/datasetSheetColumns.ts`,
  `composables/useDatasetSheet.ts`, both locale files.
- **Delivers:** the contract, sort and filter rules (US-5.2, US-8.4), dropping filters whose
  `columnType` changed (US-8.5), `keptRowIds` (US-6.5), view persistence (US-7.3, US-7.4).
- **Check:** confirm `cellSelectionFeature` keeps the focused cell across a `data` change with
  `autoResetCellSelection: false`, and that `moveCellSelection` works with range selection off.
  If not, implement the fallback from design.md ("Risks") behind the same contract and say so.

### B: sheet

- **Owns:** `components/DatasetSheet.vue`, `DatasetSheetCell.vue`, `DatasetSheetRowMenu.vue`,
  `components/DatasetDetail.vue`. Deletes `DatasetGrid.vue`, `DatasetGridRow.vue`,
  `DatasetGridSelectCell.vue`.
- **Delivers:** US-1, US-2, US-3, US-4, US-6.3, US-6.4 (footer), US-7.2 (resize handle), US-8.1
  to US-8.3.
- `DatasetDetail` keeps owning mutations, the row panel and the asides. It passes
  `handleUpdateCell` as `onUpdateCell`.

### C: toolbar

- **Owns:** `components/DatasetSheetToolbar.vue`, `DatasetSheetFilterPopover.vue`,
  `pages/dataset/[datasetId]/index.vue`.
- **Delivers:** US-5.1, US-5.3, US-6.1, US-6.2, US-7.1. Moves export, Columns and Settings from
  the page header into the toolbar. The header keeps the breadcrumb.
- The toolbar takes `table` and the column manager and settings `v-model`s as props. B mounts it
  inside `DatasetSheet` above the grid. C builds it in isolation; B adds the one mount line.

### D: e2e and docs

- **Owns:** `apps/web/e2e/dataset-sheet.spec.ts`, `apps/docs/src/content/docs/content/datasets.mdx`,
  removal of unused `dataset.grid.*` locale keys.
- **Delivers:** a test per criterion in the PRD's testing table. Seeds datasets through the API
  (port 3110, session from `e2e/.auth/`). Runs `pnpm test:e2e`. Loads the docs-writing skill.
- Seeds one 1,000 by 20 dataset by hand, measures first render and scrolling, and reports the
  numbers for the PR description. No timing assertions in tests.
