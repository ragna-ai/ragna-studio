import { Editor } from '@tiptap/vue-3';
import { createDocumentEditorExtensions, type DocumentEditorKitOptions } from './kit';

export interface CreateDocumentEditorOptions extends DocumentEditorKitOptions {
  /** Initial content, as a markdown string. */
  content?: string;
  /** Where to place the caret on mount; omit to not steal focus. */
  autofocus?: 'start' | 'end';
  onUpdate?: (markdown: string) => void;
}

/**
 * Creates a Tiptap Editor wired for markdown in and out. Consumers never
 * need to know about `@tiptap/markdown`'s `contentType`/`getMarkdown()`
 * augmentations: the dts bundler that produces this package's declaration
 * file doesn't carry ambient module augmentations to downstream consumers,
 * so both are kept behind this factory and `getDocumentMarkdown()` below.
 */
export function createDocumentEditor(options: CreateDocumentEditorOptions = {}): Editor {
  return new Editor({
    content: options.content ?? '',
    contentType: 'markdown',
    autofocus: options.autofocus ?? false,
    extensions: createDocumentEditorExtensions({ placeholder: options.placeholder }),
    onUpdate: ({ editor }) => {
      options.onUpdate?.(getDocumentMarkdown(editor as Editor));
    },
  });
}

/** Serializes the editor's current content back to markdown, for autosave. */
export function getDocumentMarkdown(editor: Editor): string {
  return editor.getMarkdown();
}
