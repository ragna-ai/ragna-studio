// packages/media/src/services/extract.service.ts
//
// EXTRACTION ENGINE.
// `extractText` is the single choke point every consumer (chat
// attachment upload, agent context document processing) goes through, and
// the seam where an async/queued extraction would go if it's ever needed.
// No caller outside @repo/media may ever import `@firecrawl/anydoc`
// directly: extractText is the only place in the codebase that does.

import { toMarkdownBytes } from '@firecrawl/anydoc';
import type { MediaKind } from '../types';
import { getMediaKindDefinition } from './registry.service';

/**
 * Converts a document buffer to GitHub-flavored markdown. pdf/docx/pptx/
 * xlsx/csv go through anydoc's `toMarkdownBytes`, with the kind's Format
 * named explicitly from the registry, never anydoc's own auto-detection
 * (csv in particular has no content signature to detect from). txt/md are
 * UTF-8 passthrough, no conversion needed. Throws for non-extractable
 * kinds (images). Output is uncapped; per-consumer caps (e.g. chat's
 * 50,000 char cap) are the caller's responsibility.
 */
export async function extractText({
  buffer,
  kind,
}: {
  buffer: Buffer;
  kind: MediaKind;
}): Promise<string> {
  const definition = getMediaKindDefinition(kind);

  if (!definition.extractable) {
    throw new Error(`Media kind "${kind}" is not extractable`);
  }

  if (definition.anydocFormat === null) {
    return buffer.toString('utf-8');
  }

  return toMarkdownBytes(buffer, definition.anydocFormat);
}
