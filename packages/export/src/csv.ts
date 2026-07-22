import { toEuropeanDate } from './date-format';
import type { ExportFile, TabularExport, TabularExportColumnType, TabularExportValue } from './types';

const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

// Built from a char code rather than an invisible literal in source, so the
// byte-order mark can't be silently stripped by an editor or formatter.
const UTF8_BOM = String.fromCharCode(0xfeff);

// A field needs quoting if it contains the separator, a quote, or a line
// break (RFC 4180). Embedded quotes are doubled.
const NEEDS_QUOTING = /["\r\n,]/;

function quoteCsvField(text: string): string {
  return NEEDS_QUOTING.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatCsvHeaderField(columnName: string): string {
  return quoteCsvField(columnName);
}

// `date` columns render European-style, `dd.mm.yyyy` (docs/datasets/export-and-row-reorder.md
// decision 2, "Date formatting"); every other type is unformatted.
function formatCsvDataField(value: TabularExportValue, columnType: TabularExportColumnType): string {
  if (value === null) {
    return '';
  }

  const text = columnType === 'date' ? toEuropeanDate(String(value)) : String(value);
  return quoteCsvField(text);
}

/**
 * Hand-rolled CSV writer (docs/datasets/export-and-row-reorder.md decision
 * 2): comma-separated, RFC 4180 quoting, CRLF line endings, no dependency.
 * Numbers are written unformatted, `null` becomes an empty field. A UTF-8
 * BOM is prepended so Excel opens umlauts and other non-ASCII text
 * correctly. An empty dataset still writes its header row (open question 2).
 */
export async function toCsv({ columns, rows }: TabularExport): Promise<ExportFile> {
  const headerLine = columns.map((column) => formatCsvHeaderField(column.name)).join(',');
  const dataLines = rows.map((row) =>
    row.map((value, index) => formatCsvDataField(value, columns[index]?.type ?? 'text')).join(','),
  );

  const csvBody = `${[headerLine, ...dataLines].join('\r\n')}\r\n`;
  const bytes = new TextEncoder().encode(UTF8_BOM + csvBody);

  return { bytes, contentType: CSV_CONTENT_TYPE };
}
