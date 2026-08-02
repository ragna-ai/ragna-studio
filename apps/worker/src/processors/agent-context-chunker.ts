// Deterministic chunker for agent context documents
// (docs/agent/agent-context-retrieval.md, "Chunking"). No LLM: paragraphs are
// packed into target-sized chunks, oversized paragraphs are split at sentence
// boundaries (hard-split as a last resort), and each chunk after the first
// carries a fixed-length overlap from the previous one for retrieval context.
export const CHUNK_TARGET_CHARS = 1_500;
export const CHUNK_MAX_PARAGRAPH_CHARS = 2_000;
export const CHUNK_OVERLAP_CHARS = 200;

const SENTENCE_BOUNDARY_REGEX = /(?<=[.!?])\s+/;

export function chunkText(text: string): string[] {
  const segments = splitIntoParagraphs(text).flatMap(splitOversizedParagraph);
  const chunks = packSegmentsIntoChunks(segments);
  return applyOverlapAndFilter(chunks);
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function splitOversizedParagraph(paragraph: string): string[] {
  if (paragraph.length <= CHUNK_MAX_PARAGRAPH_CHARS) {
    return [paragraph];
  }

  return paragraph
    .split(SENTENCE_BOUNDARY_REGEX)
    .flatMap((sentence) =>
      sentence.length <= CHUNK_MAX_PARAGRAPH_CHARS ? [sentence] : hardSplit(sentence),
    );
}

function hardSplit(text: string): string[] {
  const parts: string[] = [];
  for (let offset = 0; offset < text.length; offset += CHUNK_TARGET_CHARS) {
    parts.push(text.slice(offset, offset + CHUNK_TARGET_CHARS));
  }
  return parts;
}

function packSegmentsIntoChunks(segments: string[]): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const segment of segments) {
    if (current.length === 0) {
      current = segment;
      continue;
    }

    if (current.length + 2 + segment.length <= CHUNK_TARGET_CHARS) {
      current = `${current}\n\n${segment}`;
    } else {
      chunks.push(current);
      current = segment;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function applyOverlapAndFilter(chunks: string[]): string[] {
  const result: string[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const previous = chunks[index - 1];
    const withOverlap = previous ? previous.slice(-CHUNK_OVERLAP_CHARS) + chunks[index] : chunks[index];

    if (withOverlap.trim().length > 0) {
      result.push(withOverlap);
    }
  }

  return result;
}
