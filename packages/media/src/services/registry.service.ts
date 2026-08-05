// packages/media/src/services/registry.service.ts
//
// The media type registry (docs/media-library/unified-media-prd.md,
// decision 2): one table keyed by MediaKind carrying everything that used
// to live in two separate sniffers (sniffChatMediaKind,
// sniffAgentContextDocumentKind). The registry is data, consumers are
// declarations: every caller passes an `accept` list (normally IMAGE_KINDS,
// DOCUMENT_KINDS, or a combination) instead of hand-rolling its own
// accepted-type logic.
//
// SECURITY: kinds are identified by sniffing file content (magic bytes,
// plus extension disambiguation where a container format is ambiguous on
// its own), never by the client-supplied mime type or filename alone. A
// malicious upload can name and label itself however it wants.

import { formatFromExtension, type Format } from '@firecrawl/anydoc';
import { MIME_TYPE_BY_MEDIA_KIND, type MediaKind, type SniffedMedia } from '../types';

// `Format` is a const enum, which TypeScript's `verbatimModuleSyntax`
// forbids accessing by member (`Format.pdf`) across a module boundary.
// `formatFromExtension` (a real function, exported for exactly this kind of
// lookup) gets the same values without that restriction.
function anydocFormatForExtension(extension: string): Format {
  const format = formatFromExtension(extension);

  if (format === null) {
    throw new Error(`anydoc has no Format for extension "${extension}"`);
  }

  return format;
}

interface MediaKindDefinition {
  kind: MediaKind;
  mimeType: string;
  extensions: readonly string[];
  extractable: boolean;
  // anydoc's Format enum, for extract.service.ts's toMarkdownBytes call.
  // Null for kinds anydoc never touches: images (unextractable, no OCR
  // today) and txt/md (UTF-8 passthrough, no conversion needed).
  anydocFormat: Format | null;
  matches: (buffer: Buffer, lowerFilename: string) => boolean;
}

function hasExtension(lowerFilename: string, extensions: readonly string[]): boolean {
  return extensions.some((extension) => lowerFilename.endsWith(extension));
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

function hasPngMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, 8).toString('latin1') === '\x89PNG\r\n\x1a\n';
}

function hasJpegMagicBytes(buffer: Buffer): boolean {
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function hasWebpMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

// Every Office Open XML container (docx/pptx/xlsx) shares the same ZIP
// magic bytes, so the extension is the only thing that tells them apart,
// same disambiguation trick the pre-unification sniffers used for docx.
function zipFamilyMatcher(
  extensions: readonly string[],
): (buffer: Buffer, lowerFilename: string) => boolean {
  return (buffer, lowerFilename) => hasZipMagicBytes(buffer) && hasExtension(lowerFilename, extensions);
}

// Plain-text kinds (txt/md/csv) have no magic bytes at all: any valid UTF-8
// buffer qualifies, so the extension is again the only signal.
function utf8FamilyMatcher(
  extensions: readonly string[],
): (buffer: Buffer, lowerFilename: string) => boolean {
  return (buffer, lowerFilename) => isValidUtf8(buffer) && hasExtension(lowerFilename, extensions);
}

const REGISTRY: Record<MediaKind, MediaKindDefinition> = {
  png: {
    kind: 'png',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.png,
    extensions: ['.png'],
    extractable: false,
    anydocFormat: null,
    matches: (buffer) => hasPngMagicBytes(buffer),
  },
  jpeg: {
    kind: 'jpeg',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.jpeg,
    extensions: ['.jpg', '.jpeg'],
    extractable: false,
    anydocFormat: null,
    matches: (buffer) => hasJpegMagicBytes(buffer),
  },
  webp: {
    kind: 'webp',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.webp,
    extensions: ['.webp'],
    extractable: false,
    anydocFormat: null,
    matches: (buffer) => hasWebpMagicBytes(buffer),
  },
  pdf: {
    kind: 'pdf',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.pdf,
    extensions: ['.pdf'],
    extractable: true,
    anydocFormat: anydocFormatForExtension('pdf'),
    matches: (buffer) => hasPdfMagicBytes(buffer),
  },
  docx: {
    kind: 'docx',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.docx,
    extensions: ['.docx'],
    extractable: true,
    anydocFormat: anydocFormatForExtension('docx'),
    matches: zipFamilyMatcher(['.docx']),
  },
  pptx: {
    kind: 'pptx',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.pptx,
    extensions: ['.pptx'],
    extractable: true,
    anydocFormat: anydocFormatForExtension('pptx'),
    matches: zipFamilyMatcher(['.pptx']),
  },
  xlsx: {
    kind: 'xlsx',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.xlsx,
    extensions: ['.xlsx'],
    extractable: true,
    anydocFormat: anydocFormatForExtension('xlsx'),
    matches: zipFamilyMatcher(['.xlsx']),
  },
  csv: {
    kind: 'csv',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.csv,
    extensions: ['.csv'],
    extractable: true,
    // csv has no content signature (anydoc's own formatFromBytes returns
    // null for it too), so the format is always named explicitly here,
    // never left to anydoc's auto-detection.
    anydocFormat: anydocFormatForExtension('csv'),
    matches: utf8FamilyMatcher(['.csv']),
  },
  txt: {
    kind: 'txt',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.txt,
    extensions: ['.txt'],
    extractable: true,
    anydocFormat: null,
    matches: utf8FamilyMatcher(['.txt']),
  },
  md: {
    kind: 'md',
    mimeType: MIME_TYPE_BY_MEDIA_KIND.md,
    extensions: ['.md'],
    extractable: true,
    anydocFormat: null,
    matches: utf8FamilyMatcher(['.md']),
  },
};

// Package-internal accessor: extract.service.ts reads `extractable` and
// `anydocFormat` off the same definitions sniffMediaKind matches against.
// Not part of the public API (see ../index.ts).
export function getMediaKindDefinition(kind: MediaKind): MediaKindDefinition {
  return REGISTRY[kind];
}

/**
 * Identifies a media kind from file content (see the SECURITY note above).
 * `accept` scopes which kinds are considered, named after the HTML file
 * input's `accept` attribute: normally `IMAGE_KINDS`, `DOCUMENT_KINDS`, or
 * `[...IMAGE_KINDS, ...DOCUMENT_KINDS]`. Each kind's matcher already folds
 * in its own extension disambiguation, so the result never depends on the
 * order of `accept`.
 */
export function sniffMediaKind(
  buffer: Buffer,
  filename: string,
  { accept }: { accept: readonly MediaKind[] },
): SniffedMedia | null {
  const lowerFilename = filename.toLowerCase();

  for (const kind of accept) {
    const definition = REGISTRY[kind];
    if (definition.matches(buffer, lowerFilename)) {
      return { kind: definition.kind, mimeType: definition.mimeType };
    }
  }

  return null;
}
