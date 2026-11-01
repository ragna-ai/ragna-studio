import type { Column } from '@tanstack/vue-table';
import type { DatasetRow } from '~/features/dataset/types';
import type { DatasetSheetFeatures } from '~/features/dataset/utils/datasetSheetColumns';

export type SheetColumn = Column<DatasetSheetFeatures, DatasetRow, unknown>;

/** Matches the `w-11` of the add-column column. */
export const ADD_COLUMN_WIDTH_PX = 44;

export function columnStyle(column: SheetColumn) {
  return {
    width: `${column.getSize()}px`,
    left:
      column.getIsPinned() === 'start'
        ? `${column.getStart('start')}px`
        : undefined,
  };
}

export function pinnedClass(column: SheetColumn) {
  return column.getIsPinned() ? 'sticky z-10' : '';
}
