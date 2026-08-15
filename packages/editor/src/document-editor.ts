import { Editor } from '@tiptap/vue-3';
import { createDocumentEditorExtensions } from './kit';

export interface CreateDocumentEditorOptions {
  content?: string;
  /**
   * Default 'markdown'. 'html' builds an instance with no `@tiptap/markdown`
   * extension loaded at all (docs/email/html-content-change-request.md), so
   * `getMarkdown()` isn't just discouraged on it, it doesn't exist at
   * runtime - callers must use `getHTML()`/`getText()` and pass
   * `{ contentType: 'html' }` to every later `setContent()` call too, since
   * that option defaults to 'json' per call, not per instance.
   */
  contentType?: 'markdown' | 'html';
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (value: string) => void;
}

/**
 * Creates a Tiptap Editor for either markdown (document/task) or HTML
 * (email compose) content, chosen per instance via `contentType`. Consumers
 * never need to know about `@tiptap/markdown`'s `contentType`/`getMarkdown()`
 * augmentations: the dts bundler that produces this package's declaration
 * file doesn't carry ambient module augmentations to downstream consumers,
 * so both are kept behind this factory and `getDocumentMarkdown()` below.
 */
export function createDocumentEditor(options: CreateDocumentEditorOptions = {}): Editor {
  const hasMarkdown = options.contentType === 'markdown' || !options.contentType;
  return new Editor({
    content: options.content ?? '',
    contentType: options.contentType ?? 'markdown',
    autofocus: options.autofocus ?? false,
    extensions: createDocumentEditorExtensions({ placeholder: options.placeholder, hasMarkdown }),
    onUpdate: ({ editor }) => {
      options.onUpdate?.(hasMarkdown ? editor.getMarkdown() : editor.getHTML());
    },
  });
}

/** Serializes the editor's current content back to markdown, for autosave. */
export function getDocumentMarkdown(editor: Editor): string {
  return editor.getMarkdown();
}
