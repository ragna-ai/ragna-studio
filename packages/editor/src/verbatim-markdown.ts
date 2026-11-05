import type { MarkdownManager } from '@tiptap/markdown';

/**
 * Makes this manager write text nodes as typed. The method is private in
 * Tiptap's types and has no option to turn it off, so it is replaced on the instance only.
 */
export function disableTextEscaping(manager: MarkdownManager): void {
  manager['encodeTextForMarkdown'] = (text: string) => text;
}
