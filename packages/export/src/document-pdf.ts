import { asMarkedToken, flattenInline, parseMarkdownTokens } from './markdown-tokens';
import type { InlineSpan, Token, Tokens } from './markdown-tokens';
import pdfMake from './pdfmake-instance';
import type { PdfContent, PdfDocumentDefinition } from './pdfmake-instance';
import type { DocumentExport, ExportFile } from './types';

const PDF_CONTENT_TYPE = 'application/pdf';

// A4 portrait content width at the default 40pt margins (595.28 - 2*40),
// used to size the horizontal-rule line.
const CONTENT_WIDTH = 515;

const HEADING_FONT_SIZES: Record<number, number> = { 1: 20, 2: 17, 3: 15, 4: 13, 5: 12, 6: 11 };
const DEFAULT_HEADING_FONT_SIZE = 11;

function spanToTextRun(span: InlineSpan) {
  return {
    text: span.text,
    bold: span.bold || undefined,
    italics: span.italic || undefined,
    font: span.code ? 'Courier' : undefined,
    color: span.linkHref ? '#1a73e8' : undefined,
    decoration: span.linkHref
      ? ('underline' as const)
      : span.strike
        ? ('lineThrough' as const)
        : undefined,
    link: span.linkHref,
  };
}

// Deliberately not typed as `PdfContent` (a broad union that includes
// non-object members like `string`): spreading that union elsewhere (e.g.
// `{ ...spansToContent(...), bold: true }` for a bold table header cell)
// would otherwise fail with "Spread types may only be created from object
// types". This concrete shape is still assignable to `PdfContent` wherever
// it's used.
function spansToContent(spans: InlineSpan[]) {
  return { text: spans.map(spanToTextRun) };
}

function headingToContent(token: Tokens.Heading): PdfContent {
  return {
    text: flattenInline(token.tokens).map(spanToTextRun),
    fontSize: HEADING_FONT_SIZES[token.depth] ?? DEFAULT_HEADING_FONT_SIZE,
    bold: true,
    margin: [0, 10, 0, 6],
  };
}

function codeToContent(token: Tokens.Code): PdfContent {
  return {
    text: token.text,
    font: 'Courier',
    fontSize: 9,
    background: '#f2f2f2',
    margin: [0, 4, 0, 10],
  };
}

function blockquoteToContent(token: Tokens.Blockquote): PdfContent {
  return {
    stack: token.tokens.map((child) => blockToContent(child)),
    italics: true,
    color: '#555555',
    margin: [10, 4, 0, 10],
  };
}

// A list item's own text lives in its `text`/`paragraph` content tokens; a
// nested list lives in a `list` token alongside them.
function listItemToContent(item: Tokens.ListItem): PdfContent {
  const nestedLists = item.tokens.filter((token): token is Tokens.List => token.type === 'list');
  const ownSpans = item.tokens
    .filter(
      (token): token is Tokens.Text | Tokens.Paragraph =>
        token.type === 'text' || token.type === 'paragraph',
    )
    .flatMap((token) => flattenInline(token.tokens));

  const ownContent = spansToContent(ownSpans);

  if (nestedLists.length === 0) {
    return ownContent;
  }

  // Nesting a `ul`/`ol` inside an item's content is how pdfmake indents it
  // under its parent item.
  return { stack: [ownContent, ...nestedLists.map((nested) => listToContent(nested))] };
}

function listToContent(list: Tokens.List): PdfContent {
  const items = list.items.map((item) => listItemToContent(item));

  return list.ordered
    ? {
        ol: items,
        start: typeof list.start === 'number' ? list.start : undefined,
        margin: [0, 0, 0, 10],
      }
    : { ul: items, margin: [0, 0, 0, 10] };
}

function hrToContent(): PdfContent {
  return {
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1, lineColor: '#999999' },
    ],
    margin: [0, 10, 0, 10],
  };
}

function tableToContent(table: Tokens.Table): PdfContent {
  return {
    table: {
      headerRows: 1,
      widths: table.header.map(() => '*'),
      body: [
        table.header.map((cell) => ({ ...spansToContent(flattenInline(cell.tokens)), bold: true })),
        ...table.rows.map((row) => row.map((cell) => spansToContent(flattenInline(cell.tokens)))),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 10],
  };
}

// Walks one block-level token into pdfmake content. Unsupported tokens
// degrade to their raw markdown text.
function blockToContent(rawToken: Token): PdfContent {
  const token = asMarkedToken(rawToken);

  switch (token.type) {
    case 'heading':
      return headingToContent(token);
    case 'paragraph':
    case 'text':
      return { ...spansToContent(flattenInline(token.tokens)), margin: [0, 0, 0, 8] };
    case 'code':
      return codeToContent(token);
    case 'blockquote':
      return blockquoteToContent(token);
    case 'list':
      return listToContent(token);
    case 'hr':
      return hrToContent();
    case 'table':
      return tableToContent(token);
    case 'space':
    case 'def':
    case 'html':
      return { text: '' };
    default:
      return token.raw.trim() ? { text: token.raw.trim(), margin: [0, 0, 0, 8] } : { text: '' };
  }
}

function toDocumentPdfDefinition({ title, markdown }: DocumentExport): PdfDocumentDefinition {
  const tokens = parseMarkdownTokens(markdown);

  return {
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content: [
      { text: title, fontSize: 20, bold: true, marginBottom: 12 },
      ...tokens.map(blockToContent),
    ],
  };
}

/**
 * `pdfmake` writer for documents:
 * title, then a block-by-block rendering of
 * the parsed markdown (headings, paragraphs with bold/italic/inline code,
 * nested lists, blockquotes, code blocks, horizontal rules, colored links,
 * and GFM tables). An empty document still exports a title-only file
 * (decision 3).
 */
export async function toDocumentPdf(input: DocumentExport): Promise<ExportFile> {
  const createdPdf = pdfMake.createPdf(toDocumentPdfDefinition(input));
  const bytes = await createdPdf.getBuffer();

  return { bytes, contentType: PDF_CONTENT_TYPE };
}
