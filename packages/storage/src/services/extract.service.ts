import { config } from '@repo/config';
import mammoth from 'mammoth';
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import { MIME_TYPE_BY_KIND, type BucketDocument, type SupportedDocumentKind } from '../types';
import { downloadObjectBuffer } from './bucket.service';

export async function extractDocumentText(document: BucketDocument): Promise<string> {
  const { buffer } = await downloadObjectBuffer(config.cfDocumentsBucketName, document.storageKey);

  if (document.mimeType === 'application/pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  }

  if (document.mimeType === MIME_TYPE_BY_KIND.docx) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  // txt / md: deterministic UTF-8 passthrough, no library needed.
  return buffer.toString('utf-8');
}

export function sniffAgentDocumentKind(
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
