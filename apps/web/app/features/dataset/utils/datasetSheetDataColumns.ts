import type { Column } from '@tanstack/vue-table';
import type { DatasetColumn, DatasetRow } from '~/features/dataset/types';
import type { DatasetSheetTable } from '~/features/dataset/composables/useDatasetSheet';
import type { DatasetSheetFeatures } from '~/features/dataset/utils/datasetSheetColumns';

export interface SheetDataColumn {
  tableColumn: Column<DatasetSheetFeatures, DatasetRow>;
  datasetColumn: DatasetColumn;
}

/** The table's data columns in display order, without the row-number column. */
export function getSheetDataColumns(
  table: DatasetSheetTable,
): SheetDataColumn[] {
  return table.getAllLeafColumns().flatMap((tableColumn) => {
    const datasetColumn = tableColumn.columnDef.meta?.column;
    return datasetColumn ? [{ tableColumn, datasetColumn }] : [];
  });
}
