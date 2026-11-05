import { Editor } from '@tiptap/vue-3';
import { createRichTextEditorExtensions } from './kit';
import { getEditorProfile, type EditorProfileId } from './profiles';
import type { SlashCommandHandlers } from './slash-command';
import { getEnabledRuleExtensions } from './typing-rules';
import { disableTextEscaping } from './verbatim-markdown';

export type ContentType = 'markdown' | 'html';

export interface CreateRichTextEditorOptions {
  /**
   * Decides the stored format, how text is written and what the menus offer.
   * An 'html' profile builds an instance with no `@tiptap/markdown` extension
   * loaded, so `getMarkdown()` doesn't exist on it at runtime. Callers must
   * use `getHTML()`/`getText()` and pass `{ contentType: 'html' }` to every
   * later `setContent()` call too, since that option defaults to 'json' per call.
   */
  profile: EditorProfileId;
  content?: string;
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (value: string) => void;
  slashCommand?: SlashCommandHandlers;
  /** Called on Mod-k. */
  onLinkShortcut?: () => void;
  /** Attributes set once on the editable element, e.g. `aria-labelledby`. */
  attributes?: Record<string, string>;
}

/**
 * Creates a Tiptap Editor for markdown or HTML content, chosen by its profile.
 * Consumers never need to know about `@tiptap/markdown`'s `contentType`/`getMarkdown()`
 * augmentations: the dts bundler that produces this package's declaration
 * file doesn't carry ambient module augmentations to downstream consumers,
 * so both are kept behind this factory and `getEditorContent()` below.
 */
export function createRichTextEditor(options: CreateRichTextEditorOptions): Editor {
  const profile = getEditorProfile(options.profile);
  const hasMarkdown = profile.contentType === 'markdown';
  const extensions = createRichTextEditorExtensions({
    placeholder: options.placeholder,
    hasMarkdown,
    smartTypography: profile.smartTypography,
    slashCommand: options.slashCommand,
    onLinkShortcut: options.onLinkShortcut,
  });
  const enabledRules = getEnabledRuleExtensions(extensions, profile.markShortcuts);
  const editor = new Editor({
    content: options.content ?? '',
    contentType: profile.contentType,
    autofocus: options.autofocus ?? false,
    editorProps: { attributes: options.attributes },
    enableInputRules: enabledRules,
    enablePasteRules: enabledRules,
    extensions,
    onUpdate: ({ editor }) => {
      options.onUpdate?.(hasMarkdown ? editor.getMarkdown() : editor.getHTML());
    },
  });
  if (
    profile.contentType === 'markdown' &&
    profile.textEncoding === 'verbatim' &&
    editor.markdown
  ) {
    disableTextEscaping(editor.markdown);
  }
  return editor;
}

/** Serializes the editor's current content as markdown or HTML, matching its `contentType`. */
export function getEditorContent(editor: Editor, contentType: ContentType): string {
  return contentType === 'markdown' ? editor.getMarkdown() : editor.getHTML();
}

/**
 * Replaces the editor's content without firing `onUpdate`. `contentType` must match the instance's own
 * `contentType` (see `CreateRichTextEditorOptions` above): it isn't carried
 * over from the instance and defaults to 'json' per call.
 */
export function setEditorContent(editor: Editor, content: string, contentType: ContentType): void {
  editor.commands.setContent(content, { contentType, emitUpdate: false });
}

/** The plain text of the document, e.g. for the text part of an email. */
export function getEditorText(editor: Editor): string {
  return editor.getText();
}
