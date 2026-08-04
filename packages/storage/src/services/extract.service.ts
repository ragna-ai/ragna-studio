import { config } from '@repo/config';
import mammoth from 'mammoth';
import readXlsxFile from 'read-excel-file/node';
import type { CellValue, Row } from 'read-excel-file/node';
import {
  MIME_TYPE_BY_CHAT_MEDIA_KIND,
  MIME_TYPE_BY_KIND,
  type BucketDocument,
  type ChatMediaKind,
  type SniffedChatMedia,
  type SupportedDocumentKind,
} from '../types';
import { downloadObjectBuffer } from './bucket.service';

export async function extractDocumentText(document: BucketDocument): Promise<string> {
  const { buffer } = await downloadObjectBuffer(config.cfDocumentsBucketName, document.storageKey);

  return extractDocumentTextFromBuffer({ buffer, mimeType: document.mimeType });
}

// Same extraction logic as extractDocumentText, but for a buffer already in
// memory. Used by the chat attachment upload path (apps/api/src/services/
// media.service.ts): the file is already read into memory to validate and
// store it, so downloading it back from R2 just to extract text would be a
// pointless round trip.
export async function extractDocumentTextFromBuffer({
  buffer,
  mimeType,
}: {
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  if (mimeType === 'application/pdf') {
    // Lazy-imported: this native napi module ships glibc-only binaries, and
    // @repo/storage is also imported by the API, which runs on Alpine Bun.
    const { extractText } = await import('@firecrawl/pdf-inspector');
    return extractText(buffer);
  }

  if (mimeType === MIME_TYPE_BY_KIND.docx) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  if (mimeType === MIME_TYPE_BY_CHAT_MEDIA_KIND.xlsx) {
    return extractXlsxText(buffer);
  }

  // txt / md / csv: deterministic UTF-8 passthrough, no library needed.
  return buffer.toString('utf-8');
}

export function sniffAgentContextDocumentKind(
  buffer: Buffer,
  filename: string,
): SupportedDocumentKind | null {
  if (hasPdfMagicBytes(buffer)) {
    return 'pdf';
  }

  if (hasZipMagicBytes(buffer) && filename.toLowerCase().endsWith('.docx')) {
    return 'docx';
  }

  if (isValidUtf8(buffer)) {
    if (filename.toLowerCase().endsWith('.md')) {
      return 'md';
    }
    if (filename.toLowerCase().endsWith('.txt')) {
      return 'txt';
    }
  }

  return null;
}

// Chat attachment sniffing (docs/media-library/prd.md, decision 6): images,
// pdf, docx, xlsx, csv, txt, md. Never trusts the client-sent mime type,
// only magic bytes plus the same zip/utf8 extension disambiguation
// sniffAgentContextDocumentKind already uses for docx.
export function sniffChatMediaKind(buffer: Buffer, filename: string): SniffedChatMedia | null {
  const imageKind = sniffImageKind(buffer);
  if (imageKind) {
    return { kind: imageKind, mimeType: MIME_TYPE_BY_CHAT_MEDIA_KIND[imageKind] };
  }

  if (hasPdfMagicBytes(buffer)) {
    return { kind: 'pdf', mimeType: MIME_TYPE_BY_CHAT_MEDIA_KIND.pdf };
  }

  const lowerFilename = filename.toLowerCase();

  if (hasZipMagicBytes(buffer)) {
    if (lowerFilename.endsWith('.docx')) {
      return { kind: 'docx', mimeType: MIME_TYPE_BY_CHAT_MEDIA_KIND.docx };
    }
    if (lowerFilename.endsWith('.xlsx')) {
      return { kind: 'xlsx', mimeType: MIME_TYPE_BY_CHAT_MEDIA_KIND.xlsx };
    }
    return null;
  }

  if (isValidUtf8(buffer)) {
    if (lowerFilename.endsWith('.md')) {
      return { kind: 'md', mimeType: MIME_TYPE_BY_CHAT_MEDIA_KIND.md };
    }
    if (lowerFilename.endsWith('.csv')) {
      return { kind: 'csv', mimeType: MIME_TYPE_BY_CHAT_MEDIA_KIND.csv };
    }
    if (lowerFilename.endsWith('.txt')) {
      return { kind: 'txt', mimeType: MIME_TYPE_BY_CHAT_MEDIA_KIND.txt };
    }
  }

  return null;
}

function sniffImageKind(buffer: Buffer): Extract<ChatMediaKind, 'png' | 'jpeg' | 'webp'> | null {
  if (buffer.subarray(0, 8).toString('latin1') === '\x89PNG\r\n\x1a\n') {
    return 'png';
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString('latin1') === '%PDF';
}

function hasZipMagicBytes(buffer: Buffer): boolean {
  return buffer[0] === 0x50 && buffer[1] === 0x4b; // 'P' 'K'
}

function isValidUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

// Renders each sheet as CSV text under a `## <sheet name>` heading (PRD,
// decision 6), so the whole workbook flattens into one text block the model
// can read like any other extracted document.
async function extractXlsxText(buffer: Buffer): Promise<string> {
  const sheets = await readXlsxFile(buffer);

  return sheets.map((sheet) => `## ${sheet.sheet}\n${rowsToCsv(sheet.data)}`).join('\n\n');
}

function rowsToCsv(rows: Row[]): string {
  return rows.map((row) => row.map(csvEscapeCell).join(',')).join('\n');
}

function csvEscapeCell(value: CellValue | null): string {
  const text = cellValueToText(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellValueToText(value: CellValue | null): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}
