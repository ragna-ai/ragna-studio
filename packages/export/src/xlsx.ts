import writeXlsxFile from 'write-excel-file/node';
import type { Row } from 'write-excel-file/node';
import { toEuropeanDate } from './date-format';
import type { ExportFile, TabularExport, TabularExportColumnType, TabularExportValue } from './types';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MAX_SHEET_NAME_LENGTH = 31;
// Excel sheet names can't contain any of []/\:*? (docs: validateSheetName in
// write-excel-file). Dataset names are freeform, so sanitize rather than let
// the writer throw.
const ILLEGAL_SHEET_NAME_CHARACTERS = /[[\]/\\:*?]/g;
const FALLBACK_SHEET_NAME = 'Sheet1';

function toSheetName(title: string): string {
  const sanitized = title.replace(ILLEGAL_SHEET_NAME_CHARACTERS, '').trim().slice(0, MAX_SHEET_NAME_LENGTH);

  return sanitized.length > 0 ? sanitized : FALLBACK_SHEET_NAME;
}

function toHeaderRow(columns: TabularExport['columns']): Row {
  return columns.map((column) => ({ value: column.name, fontWeight: 'bold' as const }));
}

// `number` columns become numeric cells; `date` columns render European-style,
// `dd.mm.yyyy` (docs/datasets/export-and-row-reorder.md decision 2, "Date
// formatting"); everything else stays text as stored.
function toDataCell(value: TabularExportValue, columnType: TabularExportColumnType) {
  if (value === null) {
    return null;
  }

  if (columnType === 'number') {
    return Number(value);
  }

  return columnType === 'date' ? toEuropeanDate(String(value)) : String(value);
}

function toDataRow(row: TabularExportValue[], columns: TabularExport['columns']): Row {
  return row.map((value, columnIndex) => toDataCell(value, columns[columnIndex]?.type ?? 'text'));
}

/**
 * `write-excel-file` writer (docs/datasets/export-and-row-reorder.md
 * decision 2): one worksheet named after the dataset, a bold header row,
 * `number` columns as numeric cells, everything else as text. An empty
 * dataset still writes its header row (open question 2).
 */
export async function toXlsx({ title, columns, rows }: TabularExport): Promise<ExportFile> {
  const sheetData: Row[] = [toHeaderRow(columns), ...rows.map((row) => toDataRow(row, columns))];

  const bytes = await writeXlsxFile(sheetData, { sheet: toSheetName(title) }).toBuffer();

  return { bytes, contentType: XLSX_CONTENT_TYPE };
}
