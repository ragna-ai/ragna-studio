import { Editor } from '@tiptap/vue-3';
import { createRichTextEditorExtensions } from './kit';
import type { SlashCommandHandlers } from './slash-command';

export type ContentType = 'markdown' | 'html';

export interface CreateRichTextEditorOptions {
  content?: string;
  /**
   * Default 'markdown'. 'html' builds an instance with no `@tiptap/markdown`
   * extension loaded at all, so
   * `getMarkdown()` isn't just discouraged on it, it doesn't exist at
   * runtime - callers must use `getHTML()`/`getText()` and pass
   * `{ contentType: 'html' }` to every later `setContent()` call too, since
   * that option defaults to 'json' per call, not per instance.
   */
  contentType?: ContentType;
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (value: string) => void;
  slashCommand?: SlashCommandHandlers;
  /** Called on Mod-k. */
  onLinkShortcut?: () => void;
}

/**
 * Creates a Tiptap Editor for either markdown (document/task) or HTML
 * (email compose) content, chosen per instance via `contentType`. Consumers
 * never need to know about `@tiptap/markdown`'s `contentType`/`getMarkdown()`
 * augmentations: the dts bundler that produces this package's declaration
 * file doesn't carry ambient module augmentations to downstream consumers,
 * so both are kept behind this factory and `getEditorContent()` below.
 */
export function createRichTextEditor(options: CreateRichTextEditorOptions = {}): Editor {
  const hasMarkdown = options.contentType === 'markdown' || !options.contentType;
  return new Editor({
    content: options.content ?? '',
    contentType: options.contentType ?? 'markdown',
    autofocus: options.autofocus ?? false,
    extensions: createRichTextEditorExtensions({
      placeholder: options.placeholder,
      hasMarkdown,
      slashCommand: options.slashCommand,
      onLinkShortcut: options.onLinkShortcut,
    }),
    onUpdate: ({ editor }) => {
      options.onUpdate?.(hasMarkdown ? editor.getMarkdown() : editor.getHTML());
    },
  });
}

/** Serializes the editor's current content as markdown or HTML, matching its `contentType`. */
export function getEditorContent(editor: Editor, contentType: ContentType): string {
  return contentType === 'markdown' ? editor.getMarkdown() : editor.getHTML();
}

/**
 * Replaces the editor's content. `contentType` must match the instance's own
 * `contentType` (see `CreateRichTextEditorOptions` above): it isn't carried
 * over from the instance and defaults to 'json' per call.
 */
export function setEditorContent(editor: Editor, content: string, contentType: ContentType): void {
  editor.commands.setContent(content, { contentType });
}

/** The plain text of the document, e.g. for the text part of an email. */
export function getEditorText(editor: Editor): string {
  return editor.getText();
}
