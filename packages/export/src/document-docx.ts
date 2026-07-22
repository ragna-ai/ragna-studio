import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ParagraphChild } from 'docx';
import { asMarkedToken, flattenInline, parseMarkdownTokens } from './markdown-tokens';
import type { InlineSpan, Token, Tokens } from './markdown-tokens';
import type { DocumentExport, ExportFile } from './types';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Twips (1/1440 inch) per nesting/quote level: 720 = 0.5in, docx's usual
// list-indent unit.
const INDENT_PER_LEVEL = 720;

const HEADING_LEVELS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

// A block or nested list may need italics/indent forced onto it by an
// ancestor (blockquote, list nesting). Threaded through instead of mutating
// already-built Paragraph instances, which docx doesn't support.
interface BlockContext {
  indentLevel: number;
  forceItalic: boolean;
}

const ROOT_CONTEXT: BlockContext = { indentLevel: 0, forceItalic: false };

type DocxBlock = Paragraph | Table;

function paragraphIndent(context: BlockContext): { left: number } | undefined {
  return context.indentLevel > 0 ? { left: context.indentLevel * INDENT_PER_LEVEL } : undefined;
}

// A span whose text is exactly a single newline only ever comes from a `br`
// token (an explicit hard break, e.g. a trailing-double-space or `<br>`):
// ordinary text spans never contain a raw "\n" (soft breaks are normalized
// to spaces in `markdown-tokens.ts`). docx doesn't treat "\n" inside a
// `TextRun`'s text specially, so it needs its own break run instead.
function spanToRun(span: InlineSpan, context: BlockContext): ParagraphChild {
  if (span.text === '\n') {
    return new TextRun({ break: 1 });
  }

  const run = new TextRun({
    text: span.text,
    bold: span.bold,
    italics: span.italic || context.forceItalic || undefined,
    strike: span.strike,
    font: span.code ? 'Courier New' : undefined,
  });

  return span.linkHref ? new ExternalHyperlink({ link: span.linkHref, children: [run] }) : run;
}

function textParagraph(spans: InlineSpan[], context: BlockContext): Paragraph {
  return new Paragraph({
    indent: paragraphIndent(context),
    children: spans.map((span) => spanToRun(span, context)),
  });
}

function headingParagraph(token: Tokens.Heading, context: BlockContext): Paragraph {
  return new Paragraph({
    heading: HEADING_LEVELS[token.depth],
    indent: paragraphIndent(context),
    children: flattenInline(token.tokens).map((span) => spanToRun(span, context)),
  });
}

function codeParagraph(token: Tokens.Code, context: BlockContext): Paragraph {
  const lines = token.text.split('\n');

  return new Paragraph({
    indent: paragraphIndent(context),
    shading: { fill: 'F2F2F2' },
    children: lines.flatMap((line, index) => [
      ...(index > 0 ? [new TextRun({ break: 1 })] : []),
      new TextRun({ text: line, font: 'Courier New' }),
    ]),
  });
}

function blockquoteBlocks(token: Tokens.Blockquote, context: BlockContext): DocxBlock[] {
  const quotedContext: BlockContext = { indentLevel: context.indentLevel + 1, forceItalic: true };
  return token.tokens.flatMap((child) => blockToDocx(child, quotedContext));
}

// A list item's own text lives in its `text`/`paragraph` content tokens; a
// nested list lives in a `list` token alongside them.
function listItemBlocks(
  list: Tokens.List,
  item: Tokens.ListItem,
  index: number,
  context: BlockContext,
): DocxBlock[] {
  const marker = list.ordered ? `${(typeof list.start === 'number' ? list.start : 1) + index}.` : '•';
  const ownSpans = item.tokens
    .filter((token): token is Tokens.Text | Tokens.Paragraph => token.type === 'text' || token.type === 'paragraph')
    .flatMap((token) => flattenInline(token.tokens));
  const nestedLists = item.tokens.filter((token): token is Tokens.List => token.type === 'list');

  const itemContext: BlockContext = { ...context, indentLevel: context.indentLevel + 1 };
  const ownParagraph = textParagraph([{ text: `${marker} ` }, ...ownSpans], itemContext);
  const nestedBlocks = nestedLists.flatMap((nested) => listBlocks(nested, itemContext));

  return [ownParagraph, ...nestedBlocks];
}

function listBlocks(list: Tokens.List, context: BlockContext): DocxBlock[] {
  return list.items.flatMap((item, index) => listItemBlocks(list, item, index, context));
}

function hrParagraph(context: BlockContext): Paragraph {
  return new Paragraph({
    indent: paragraphIndent(context),
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'auto' } },
    children: [],
  });
}

function tableCellNode(cell: Tokens.TableCell, bold: boolean, context: BlockContext): TableCell {
  const spans = flattenInline(cell.tokens).map((span) => (bold ? { ...span, bold: true } : span));

  return new TableCell({ children: [textParagraph(spans, context)] });
}

function tableNode(table: Tokens.Table, context: BlockContext): Table {
  const headerRow = new TableRow({
    children: table.header.map((cell) => tableCellNode(cell, true, context)),
  });
  const bodyRows = table.rows.map(
    (row) => new TableRow({ children: row.map((cell) => tableCellNode(cell, false, context)) }),
  );

  return new Table({ rows: [headerRow, ...bodyRows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

// Walks one block-level token into docx nodes. Unsupported tokens degrade
// to a plain paragraph of their raw markdown (docs/datasets/export-and-row-reorder.md
// "Document export" decision 2: "never an error").
function blockToDocx(rawToken: Token, context: BlockContext): DocxBlock[] {
  const token = asMarkedToken(rawToken);

  switch (token.type) {
    case 'heading':
      return [headingParagraph(token, context)];
    case 'paragraph':
    case 'text':
      return [textParagraph(flattenInline(token.tokens), context)];
    case 'code':
      return [codeParagraph(token, context)];
    case 'blockquote':
      return blockquoteBlocks(token, context);
    case 'list':
      return listBlocks(token, context);
    case 'hr':
      return [hrParagraph(context)];
    case 'table':
      return [tableNode(token, context)];
    case 'space':
    case 'def':
    case 'html':
      return [];
    default:
      return token.raw.trim() ? [textParagraph([{ text: token.raw.trim() }], context)] : [];
  }
}

/**
 * `docx` writer for documents (docs/datasets/export-and-row-reorder.md
 * "Document export" decision 2): same token walk as the text and PDF
 * writers, mapped to `Paragraph`/`TextRun`/`HeadingLevel`/table nodes.
 * Lists render as indented paragraphs with a literal marker rather than
 * Word's native numbering (same degrade rule, kept simple on purpose). An
 * empty document still exports a title-only file (decision 3).
 */
export async function toDocumentDocx({ title, markdown }: DocumentExport): Promise<ExportFile> {
  const tokens = parseMarkdownTokens(markdown);

  const titleParagraph = new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: title })],
  });
  const bodyBlocks = tokens.flatMap((token) => blockToDocx(token, ROOT_CONTEXT));

  const document = new Document({ sections: [{ children: [titleParagraph, ...bodyBlocks] }] });
  const bytes = await Packer.toBuffer(document);

  return { bytes, contentType: DOCX_CONTENT_TYPE };
}
