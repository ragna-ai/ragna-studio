import type { AnyExtension } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TableKit } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

export interface DocumentEditorKitOptions {
  /** Shown when the editor has no content. */
  placeholder?: string;
}

/**
 * Extension lineup for the documents editor (ported from the prior-art
 * `_createEditorInstance`, minus comments/NodeTracker/invisible-characters/
 * inline-completion, which have no place in a markdown-only document).
 *
 * StarterKit in this Tiptap version already bundles `underline`, `link`,
 * and `listKeymap`, so `underline` and `link` are disabled here and re-added
 * as their own extensions (matching the package's declared dependencies and
 * letting `Link` take editor-specific options), `codeBlock` is disabled and
 * replaced by `CodeBlockLowlight` for syntax highlighting, while
 * `listKeymap` is left on StarterKit's default rather than importing a
 * second copy.
 */
export function createDocumentEditorExtensions(
  options: DocumentEditorKitOptions = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: false,
      underline: false,
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? '',
    }),
    Highlight,
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
    }),
    Image,
    CodeBlockLowlight.configure({ lowlight }),
    Typography,
    CharacterCount,
    TextAlign.configure({
      types: ['heading', 'paragraph', 'listItem'],
    }),
    TaskList,
    TaskItem,
    TableKit.configure({
      table: { resizable: true },
    }),
    Markdown.configure({
      markedOptions: {
        // tokenizer: {
        //   url: (src) => undefined, // disable autolinking of URLs
        // },
      },
    }),
  ];
}
