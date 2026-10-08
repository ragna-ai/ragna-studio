import { toEuropeanDate } from './date-format';
import type { ExportFile, TabularExport, TabularExportColumnType, TabularExportValue } from './types';

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

// GFM table cell rules: `|` would otherwise split the cell, and a literal
// newline would break the row onto multiple lines.
function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>');
}

// `date` columns render European-style, `dd.mm.yyyy`;
// every other type is unformatted.
function formatMarkdownDataCell(value: TabularExportValue, columnType: TabularExportColumnType): string {
  if (value === null) {
    return '';
  }

  const text = columnType === 'date' ? toEuropeanDate(String(value)) : String(value);
  return escapeMarkdownCell(text);
}

function toMarkdownRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

/**
 * Hand-rolled Markdown writer:
 * `# <dataset name>` heading, then a GFM table (header row,
 * `---` separator row, one line per data row). No dependency. An empty
 * dataset still writes its header row (open question 2).
 */
export async function toMarkdown({ title, columns, rows }: TabularExport): Promise<ExportFile> {
  const lines = [
    `# ${title}`,
    '',
    toMarkdownRow(columns.map((column) => escapeMarkdownCell(column.name))),
    toMarkdownRow(columns.map(() => '---')),
    ...rows.map((row) =>
      toMarkdownRow(row.map((value, index) => formatMarkdownDataCell(value, columns[index]?.type ?? 'text'))),
    ),
  ];

  const bytes = new TextEncoder().encode(`${lines.join('\n')}\n`);

  return { bytes, contentType: MARKDOWN_CONTENT_TYPE };
}
