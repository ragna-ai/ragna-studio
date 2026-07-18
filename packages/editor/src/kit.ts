import type { AnyExtension } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

export interface DocumentEditorKitOptions {
  /** Shown when the editor has no content. */
  placeholder?: string;
}

/**
 * Extension lineup for the documents editor (ported from the prior-art
 * `_createEditorInstance`, minus comments/NodeTracker/invisible-characters/
 * inline-completion, which have no place in a markdown-only document).
 *
 * StarterKit in this Tiptap version already bundles `underline` and
 * `listKeymap`, so `underline` is disabled here and re-added as its own
 * extension (matching the package's declared dependency), while
 * `listKeymap` is left on StarterKit's default rather than importing a
 * second copy.
 */
export function createDocumentEditorExtensions(
  options: DocumentEditorKitOptions = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false,
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? '',
    }),
    Highlight,
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph', 'listItem'],
    }),
    TaskList,
    TaskItem,
    Markdown,
  ];
}
