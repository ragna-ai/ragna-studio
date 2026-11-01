import { useLocalStorage } from '@vueuse/core';
import {
  functionalUpdate,
  useTable,
  type ColumnFiltersState,
  type ColumnSizingState,
  type OnChangeFn,
  type SortingState,
  type ColumnVisibilityState,
  type VueTable,
} from '@tanstack/vue-table';
import {
  computed,
  ref,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import { z } from 'zod';
import type {
  Dataset,
  DatasetColumn,
  DatasetRow,
} from '~/features/dataset/types';
import {
  buildSheetColumns,
  datasetSheetFeatures,
  datasetSheetFilterSchema,
  ROW_NUMBER_COLUMN_ID,
  type DatasetSheetFeatures,
} from '~/features/dataset/utils/datasetSheetColumns';
import { parseCellValue } from '~/features/dataset/utils/parseCellValue';

export type DatasetSheetTable = VueTable<DatasetSheetFeatures, DatasetRow>;

export interface SheetCell {
  rowId: string;
  columnId: string;
}

export interface UseDatasetSheetOptions {
  dataset: MaybeRefOrGetter<Dataset>;
  rows: MaybeRefOrGetter<DatasetRow[]>;
  /** A rejection reaches the caller of `commitEdit` and `clearCell`. */
  onUpdateCell: (
    rowId: string,
    columnId: string,
    value: string | number | null,
  ) => Promise<void>;
}

export interface UseDatasetSheetResult {
  table: DatasetSheetTable;
  hasActiveView: ComputedRef<boolean>;
  totalRowCount: ComputedRef<number>;
  visibleRowCount: ComputedRef<number>;
  editingCell: Ref<SheetCell | null>;
  draft: Ref<string>;
  startEditing: (cell: SheetCell, initialDraft?: string) => void;
  commitEdit: () => Promise<void>;
  cancelEdit: () => void;
  clearCell: (cell: SheetCell) => Promise<void>;
  keepRowVisible: (rowId: string) => void;
  clearView: () => void;
}

const storedViewSchema = z.object({
  sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })),
  columnFilters: z.array(
    z.object({ id: z.string(), value: datasetSheetFilterSchema }),
  ),
  columnVisibility: z.record(z.string(), z.boolean()),
  columnSizing: z.record(z.string(), z.number()),
});

interface StoredView {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  columnVisibility: ColumnVisibilityState;
  columnSizing: ColumnSizingState;
}

function createEmptyView(): StoredView {
  return {
    sorting: [],
    columnFilters: [],
    columnVisibility: {},
    columnSizing: {},
  };
}

const storedViewSerializer = {
  read(raw: string): StoredView {
    try {
      const parsed = storedViewSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : createEmptyView();
    } catch {
      return createEmptyView();
    }
  },
  write: (view: StoredView) => JSON.stringify(view),
};

function pickKnownColumnIds<T>(
  record: Record<string, T>,
  columnIds: ReadonlySet<string>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([columnId]) => columnIds.has(columnId)),
  );
}

/**
 * Drops sort, filter, visibility and sizing entries for deleted columns, and
 * filters built for a column type the column no longer has.
 */
function pruneView(view: StoredView, columns: DatasetColumn[]): StoredView {
  const typeByColumnId = new Map(columns.map((c) => [c.id, c.type]));
  const columnIds = new Set(typeByColumnId.keys());
  return {
    sorting: view.sorting.filter((sort) => columnIds.has(sort.id)),
    columnFilters: view.columnFilters.filter((filter) => {
      const parsed = datasetSheetFilterSchema.safeParse(filter.value);
      return (
        parsed.success &&
        parsed.data.columnType === typeByColumnId.get(filter.id)
      );
    }),
    columnVisibility: pickKnownColumnIds(view.columnVisibility, columnIds),
    columnSizing: pickKnownColumnIds(view.columnSizing, columnIds),
  };
}

function toDraftText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Maps editor text to the value saved for the column, or `undefined` if it is unusable. */
function draftToCellValue(
  column: DatasetColumn,
  draft: string,
): string | number | null | undefined {
  if (draft === '') {
    return null;
  }
  if (column.type !== 'number') {
    return draft;
  }
  const number = Number(draft);
  return Number.isFinite(number) ? number : undefined;
}

export function useDatasetSheet(
  options: UseDatasetSheetOptions,
): UseDatasetSheetResult {
  const datasetColumns = computed(() => toValue(options.dataset).columns);

  // Rows edited or added while a filter is active stay visible until the filters change.
  const keptRowIds = shallowRef<ReadonlySet<string>>(new Set());

  function keepRowVisible(rowId: string) {
    keptRowIds.value = new Set(keptRowIds.value).add(rowId);
  }

  const view = useLocalStorage<StoredView>(
    `dataset-view:${toValue(options.dataset).id}`,
    createEmptyView(),
    { serializer: storedViewSerializer },
  );

  watch(
    datasetColumns,
    (columns) => {
      const pruned = pruneView(view.value, columns);
      if (JSON.stringify(pruned) === JSON.stringify(view.value)) {
        return;
      }
      keptRowIds.value = new Set();
      view.value = pruned;
    },
    { immediate: true },
  );

  // A fresh array makes the table re-run its filters against the updated kept set.
  const tableData = computed(() => {
    void keptRowIds.value;
    return toValue(options.rows).slice();
  });

  const sheetColumns = computed(() =>
    buildSheetColumns(
      datasetColumns.value,
      (rowId) => keptRowIds.value.has(rowId),
      (columnId) =>
        view.value.sorting.some((sort) => sort.id === columnId && sort.desc),
    ),
  );

  const state = computed(() => ({
    sorting: view.value.sorting,
    columnFilters: view.value.columnFilters,
    columnVisibility: view.value.columnVisibility,
    columnSizing: view.value.columnSizing,
    columnPinning: { start: [ROW_NUMBER_COLUMN_ID], end: [] },
  }));

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    view.value.sorting = functionalUpdate(updater, view.value.sorting);
  };

  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
    keptRowIds.value = new Set();
    view.value.columnFilters = functionalUpdate(
      updater,
      view.value.columnFilters,
    );
  };

  const onColumnVisibilityChange: OnChangeFn<ColumnVisibilityState> = (
    updater,
  ) => {
    view.value.columnVisibility = functionalUpdate(
      updater,
      view.value.columnVisibility,
    );
  };

  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = (updater) => {
    view.value.columnSizing = functionalUpdate(
      updater,
      view.value.columnSizing,
    );
  };

  const table = useTable({
    features: datasetSheetFeatures,
    columns: sheetColumns,
    data: tableData,
    getRowId: (row: DatasetRow) => row.id,
    state,
    onSortingChange,
    onColumnFiltersChange,
    onColumnVisibilityChange,
    onColumnSizingChange,
    enableMultiSort: false,
    columnResizeMode: 'onChange',
    enableCellRangeSelection: false,
    enableMultiCellRangeSelection: false,
    enableCellSelectionDrag: false,
    autoResetCellSelection: false,
  });

  const hasActiveView = computed(
    () => view.value.sorting.length > 0 || view.value.columnFilters.length > 0,
  );
  const totalRowCount = computed(() => toValue(options.rows).length);
  const visibleRowCount = computed(() => {
    void tableData.value;
    return table.getRowModel().rows.length;
  });

  function clearView() {
    keptRowIds.value = new Set();
    view.value.sorting = [];
    view.value.columnFilters = [];
  }

  const editingCell = ref<SheetCell | null>(null);
  const draft = ref('');
  let originalDraft = '';

  function findColumn(columnId: string): DatasetColumn | undefined {
    return datasetColumns.value.find((column) => column.id === columnId);
  }

  function findStoredValue(cell: SheetCell) {
    const row = toValue(options.rows).find((r) => r.id === cell.rowId);
    return row?.data[cell.columnId];
  }

  function startEditing(cell: SheetCell, initialDraft?: string) {
    const column = findColumn(cell.columnId);
    if (!column) {
      return;
    }
    const parsed = parseCellValue(column, findStoredValue(cell));
    originalDraft = parsed.kind === 'valid' ? toDraftText(parsed.value) : '';
    editingCell.value = cell;
    draft.value = initialDraft ?? originalDraft;
  }

  function cancelEdit() {
    editingCell.value = null;
  }

  async function saveCell(cell: SheetCell, value: string | number | null) {
    keepRowVisible(cell.rowId);
    await options.onUpdateCell(cell.rowId, cell.columnId, value);
  }

  async function commitEdit() {
    const cell = editingCell.value;
    if (!cell) {
      return;
    }
    editingCell.value = null;

    const column = findColumn(cell.columnId);
    if (!column || draft.value === originalDraft) {
      return;
    }
    const value = draftToCellValue(column, draft.value);
    if (value === undefined) {
      return;
    }
    await saveCell(cell, value);
  }

  async function clearCell(cell: SheetCell) {
    const storedValue = findStoredValue(cell);
    if (storedValue === null || storedValue === undefined) {
      return;
    }
    await saveCell(cell, null);
  }

  return {
    table,
    hasActiveView,
    totalRowCount,
    visibleRowCount,
    editingCell,
    draft,
    startEditing,
    commitEdit,
    cancelEdit,
    clearCell,
    keepRowVisible,
    clearView,
  };
}
