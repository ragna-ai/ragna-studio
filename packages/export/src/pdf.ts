import { toEuropeanDate, toEuropeanDateTime } from './date-format';
import pdfMake from './pdfmake-instance';
import type { PdfContent, PdfDocumentDefinition } from './pdfmake-instance';
import type { ExportFile, TabularExport, TabularExportColumnType, TabularExportValue } from './types';

const PDF_CONTENT_TYPE = 'application/pdf';

// Cap a PDF cell at ~500 characters (docs/datasets/export-and-row-reorder.md
// open question 1): a single essay-length cell (the reason DatasetRowPanel
// exists) shouldn't stretch the table across dozens of pages. CSV and xlsx
// always carry the full value.
const PDF_CELL_MAX_CHARS = 500;

// More than 6 columns switches to landscape so cells keep a readable width.
const LANDSCAPE_COLUMN_THRESHOLD = 6;

// `date` columns render European-style, `dd.mm.yyyy` (docs/datasets/export-and-row-reorder.md
// decision 2, "Date formatting"), before the length cap below applies.
function formatPdfCell(value: TabularExportValue, columnType: TabularExportColumnType): string {
  if (value === null) {
    return '';
  }

  const text = columnType === 'date' ? toEuropeanDate(String(value)) : String(value);
  return text.length > PDF_CELL_MAX_CHARS ? `${text.slice(0, PDF_CELL_MAX_CHARS)}…` : text;
}

// `break-all` lets pdfmake wrap even a single long, space-free run of
// characters. Without it, one such cell overflows its column, silently
// pushing every following column (and cell) off the page.
function toHeaderCell(columnName: string) {
  return { text: columnName, bold: true, wordBreak: 'break-all' as const };
}

function toDataCell(value: TabularExportValue, columnType: TabularExportColumnType) {
  return { text: formatPdfCell(value, columnType), wordBreak: 'break-all' as const };
}

// One table with a repeating header row (`headerRows: 1`) and text wrapping,
// or, for an empty dataset, a plain note instead of a header-only table
// (open question 2).
function toTableOrEmptyNote({ columns, rows }: TabularExport): PdfContent {
  if (columns.length === 0 || rows.length === 0) {
    return { text: 'This dataset has no rows.', italics: true, margin: [0, 8, 0, 0] };
  }

  return {
    table: {
      headerRows: 1,
      widths: columns.map(() => '*'),
      body: [
        columns.map((column) => toHeaderCell(column.name)),
        ...rows.map((row) =>
          row.map((value, index) => toDataCell(value, columns[index]?.type ?? 'text')),
        ),
      ],
    },
    layout: 'lightHorizontalLines',
  };
}

function toDatasetPdfDefinition(input: TabularExport): PdfDocumentDefinition {
  const exportDate = toEuropeanDateTime(new Date());

  return {
    pageOrientation: input.columns.length > LANDSCAPE_COLUMN_THRESHOLD ? 'landscape' : 'portrait',
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    content: [
      { text: input.title, fontSize: 18, bold: true, marginBottom: 4 },
      { text: `Exported ${exportDate}`, fontSize: 10, color: 'gray', marginBottom: 12 },
      toTableOrEmptyNote(input),
    ],
  };
}

/**
 * `pdfmake` writer (docs/datasets/export-and-row-reorder.md decision 2):
 * title, export date, then one table with a repeating header row and text
 * wrapping. Landscape when the dataset has more than 6 columns. Uses
 * pdfmake's bundled Roboto vfs fonts (registered once in `pdfmake-instance.ts`).
 */
export async function toPdf(input: TabularExport): Promise<ExportFile> {
  const createdPdf = pdfMake.createPdf(toDatasetPdfDefinition(input));
  const bytes = await createdPdf.getBuffer();

  return { bytes, contentType: PDF_CONTENT_TYPE };
}
