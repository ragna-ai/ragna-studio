// Column type accepted by the export writers. Mirrors the dataset column
// types (`DatasetColumnType` in @repo/database) by value, but this package
// stays decoupled from datasets on purpose: it knows formats, not resources,
// so a future document
// export can reuse it with its own column types.
export type TabularExportColumnType = 'text' | 'number' | 'date' | 'select';

export interface TabularExportColumn {
  name: string;
  type: TabularExportColumnType;
}

// A single cell value: text, a number, or absent.
export type TabularExportValue = string | number | null;

/**
 * Format-agnostic input for the dataset writers (`toCsv`/`toXlsx`/`toPdf`/
 * `toMarkdown`). The caller (e.g. `dataset.service.ts`) resolves a resource's
 * rows and columns into this shape; the writers only ever see plain tabular
 * data, never a dataset.
 */
export interface TabularExport {
  title: string;
  columns: TabularExportColumn[];
  rows: TabularExportValue[][];
}

/**
 * Format-agnostic input for the document writers (`toDocumentMarkdown`/
 * `toDocumentText`/`toDocumentPdf`/`toDocumentDocx`), specs/datasets/export-and-row-reorder.md
 * "Document export": `markdown` is the document's canonical `content`
 * (documents/prd.md), parsed once and shared by every writer that needs
 * structure (see `markdown-tokens.ts`).
 */
export interface DocumentExport {
  title: string;
  markdown: string;
}

// A generated export file: raw bytes plus the content type to serve them with.
export interface ExportFile {
  bytes: Uint8Array;
  contentType: string;
}
