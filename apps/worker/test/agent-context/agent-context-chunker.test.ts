import { describe, expect, test } from 'bun:test';
import {
  CHUNK_MAX_PARAGRAPH_CHARS,
  CHUNK_OVERLAP_CHARS,
  CHUNK_TARGET_CHARS,
  chunkText,
} from '../../src/processors/agent-context-chunker';

describe('chunkText', () => {
  test('empty and whitespace-only input yields no chunks', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('  \n\n \n ')).toEqual([]);
  });

  test('short text becomes a single chunk', () => {
    expect(chunkText('Hello world.')).toEqual(['Hello world.']);
  });

  test('paragraphs are packed together up to the target size', () => {
    const chunks = chunkText('First paragraph.\n\nSecond paragraph.');

    expect(chunks).toEqual(['First paragraph.\n\nSecond paragraph.']);
  });

  test('a new chunk starts when the next paragraph would exceed the target', () => {
    const first = 'a'.repeat(CHUNK_TARGET_CHARS - 10);
    const second = 'b'.repeat(100);

    const chunks = chunkText(`${first}\n\n${second}`);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(first);
  });

  test('each chunk after the first starts with the previous chunk tail', () => {
    const first = 'a'.repeat(CHUNK_TARGET_CHARS - 10);
    const second = 'b'.repeat(100);

    const chunks = chunkText(`${first}\n\n${second}`);

    expect(chunks[1]).toBe(first.slice(-CHUNK_OVERLAP_CHARS) + second);
  });

  test('an oversized paragraph is split at sentence boundaries', () => {
    const sentence = `${'word '.repeat(100).trim()}.`;
    const paragraph = Array.from({ length: 10 }, () => sentence).join(' ');
    expect(paragraph.length).toBeGreaterThan(CHUNK_MAX_PARAGRAPH_CHARS);

    const chunks = chunkText(paragraph);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.endsWith('.')).toBe(true);
  });

  test('a sentence without boundaries is hard-split at the target size', () => {
    const chunks = chunkText('x'.repeat(CHUNK_MAX_PARAGRAPH_CHARS + 1));

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(CHUNK_TARGET_CHARS);
  });
});
