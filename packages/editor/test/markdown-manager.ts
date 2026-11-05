import { MarkdownManager } from '@tiptap/markdown';
import { createRichTextEditorExtensions } from '../src/kit';
import { EDITOR_PROFILES, type EditorProfileId } from '../src/profiles';
import { disableTextEscaping } from '../src/verbatim-markdown';

/** Builds the manager the way `createRichTextEditor` does for a markdown profile, without a DOM. */
export function createMarkdownManager(profileId: EditorProfileId): MarkdownManager {
  const manager = new MarkdownManager({
    extensions: createRichTextEditorExtensions({ hasMarkdown: true }),
  });
  const profile = EDITOR_PROFILES[profileId];
  if (profile.contentType === 'markdown' && profile.textEncoding === 'verbatim') {
    disableTextEscaping(manager);
  }
  return manager;
}
