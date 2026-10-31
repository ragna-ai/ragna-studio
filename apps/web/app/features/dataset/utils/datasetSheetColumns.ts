import {
  cellSelectionFeature,
  columnFilteringFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type Row,
} from '@tanstack/vue-table';
import { z } from 'zod';
import type {
  DatasetColumn,
  DatasetColumnType,
  DatasetRow,
} from '~/features/dataset/types';
import {
  parseCellValue,
  type ParsedCellValue,
} from '~/features/dataset/utils/parseCellValue';

export const ROW_NUMBER_COLUMN_ID = '__row';

const ROW_NUMBER_COLUMN_SIZE = 64;
const DATA_COLUMN_SIZE = 180;
const MIN_COLUMN_SIZE = 80;

const FILTER_OPS = [
  'contains',
  'eq',
  'lt',
  'gt',
  'on',
  'before',
  'after',
  'anyOf',
] as const;

export type DatasetFilterOp = (typeof FILTER_OPS)[number];

export const datasetSheetFilterSchema = z.object({
  columnType: z.enum(['text', 'number', 'date', 'select']),
  op: z.enum(FILTER_OPS),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

export interface DatasetSheetFilter {
  columnType: DatasetColumnType;
  op: DatasetFilterOp;
  value: string | number | string[];
}

const FILTER_OPS_BY_TYPE: Record<DatasetColumnType, DatasetFilterOp[]> = {
  text: ['contains', 'eq'],
  number: ['eq', 'lt', 'gt'],
  date: ['on', 'before', 'after'],
  select: ['anyOf'],
};

export function filterOpsFor(type: DatasetColumnType): DatasetFilterOp[] {
  return FILTER_OPS_BY_TYPE[type];
}

/** Every data column carries its dataset column in `columnDef.meta`. */
export interface SheetColumnMeta {
  column: DatasetColumn;
}

export const datasetSheetFeatures = tableFeatures({
  columnMeta: {} as SheetColumnMeta,
  rowSortingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnPinningFeature,
  cellSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
});

export type DatasetSheetFeatures = typeof datasetSheetFeatures;

export type DatasetSheetColumnDef = ColumnDef<DatasetSheetFeatures, DatasetRow>;

/**
 * What a data column's accessor returns: `undefined` for an empty cell,
 * otherwise the parsed value. Sorting puts `undefined` last in both directions.
 */
export type SheetCellValue = Exclude<ParsedCellValue, { kind: 'empty' }>;

function compareValid(
  column: DatasetColumn,
  a: string | number,
  b: string | number,
): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  if (column.type === 'select') {
    const options = column.options ?? [];
    return options.indexOf(String(a)) - options.indexOf(String(b));
  }
  return String(a).localeCompare(String(b));
}

/** Valid values by type first, then mismatches as text. */
export function compareCellValues(
  column: DatasetColumn,
  a: SheetCellValue,
  b: SheetCellValue,
): number {
  if (a.kind === 'valid' && b.kind === 'valid') {
    return compareValid(column, a.value, b.value);
  }
  if (a.kind === 'mismatch' && b.kind === 'mismatch') {
    return a.raw.localeCompare(b.raw);
  }
  return a.kind === 'valid' ? -1 : 1;
}

/** Empty and mismatching cells never match a filter. */
export function matchesFilter(
  cellValue: SheetCellValue | undefined,
  filter: DatasetSheetFilter,
): boolean {
  if (cellValue?.kind !== 'valid') {
    return false;
  }
  const { value } = cellValue;
  const target = filter.value;

  switch (filter.op) {
    case 'contains':
      return String(value).toLowerCase().includes(String(target).toLowerCase());
    case 'eq':
      return typeof value === 'number'
        ? value === Number(target)
        : String(value).toLowerCase() === String(target).toLowerCase();
    case 'lt':
      return Number(value) < Number(target);
    case 'gt':
      return Number(value) > Number(target);
    case 'on':
      return String(value) === String(target);
    case 'before':
      return String(value) < String(target);
    case 'after':
      return String(value) > String(target);
    case 'anyOf':
      return Array.isArray(target) && target.includes(String(value));
  }
}

function buildDataColumn(
  column: DatasetColumn,
  isRowKept: (rowId: string) => boolean,
  isSortedDesc: (columnId: string) => boolean,
): DatasetSheetColumnDef {
  return {
    id: column.id,
    header: column.name,
    accessorFn: (row): SheetCellValue | undefined => {
      const parsed = parseCellValue(column, row.data[column.id]);
      return parsed.kind === 'empty' ? undefined : parsed;
    },
    sortUndefined: 'last',
    sortFn: (rowA, rowB, columnId) => {
      const a = rowA.getValue<SheetCellValue | undefined>(columnId);
      const b = rowB.getValue<SheetCellValue | undefined>(columnId);
      if (!a || !b) {
        return 0;
      }
      const result = compareCellValues(column, a, b);
      // The table negates descending sorts, so pre-negate to keep mismatches after valid values.
      const crossesBuckets = a.kind !== b.kind;
      return crossesBuckets && isSortedDesc(columnId) ? -result : result;
    },
    filterFn: (
      row: Row<DatasetSheetFeatures, DatasetRow>,
      columnId: string,
      filter: DatasetSheetFilter,
    ) =>
      isRowKept(row.id) ||
      matchesFilter(row.getValue<SheetCellValue | undefined>(columnId), filter),
    size: DATA_COLUMN_SIZE,
    minSize: MIN_COLUMN_SIZE,
    meta: { column },
  };
}

const rowNumberColumn: DatasetSheetColumnDef = {
  id: ROW_NUMBER_COLUMN_ID,
  header: '#',
  size: ROW_NUMBER_COLUMN_SIZE,
  enableSorting: false,
  enableColumnFilter: false,
  enableHiding: false,
  enableResizing: false,
  enableCellSelection: false,
};

/** The `__row` column followed by one column per dataset column. */
export function buildSheetColumns(
  columns: DatasetColumn[],
  isRowKept: (rowId: string) => boolean,
  isSortedDesc: (columnId: string) => boolean,
): DatasetSheetColumnDef[] {
  return [rowNumberColumn].concat(
    columns.map((column) => buildDataColumn(column, isRowKept, isSortedDesc)),
  );
}
