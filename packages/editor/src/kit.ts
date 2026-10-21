import { Extension, type AnyExtension } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TableKit } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Typography from '@tiptap/extension-typography';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { LegacyMarks } from './legacy-marks';
import { SlashCommand, type SlashCommandHandlers } from './slash-command';

export interface RichTextEditorKitOptions {
  placeholder?: string;
  hasMarkdown?: boolean;
  slashCommand?: SlashCommandHandlers;
  onLinkShortcut?: () => void;
}

const lowlight = createLowlight(common);

/**
 * `Link`'s `addPasteRules()` registers an unconditional paste rule that
 * scans *all* pasted text with linkifyjs's TLD-aware matcher and wraps any
 * recognized substring in a link, e.g. "linear.app" or "B.Sc" (`.sc` is a
 * real ccTLD) — independent of the `autolink`/`linkOnPaste` options below,
 * which only cover typing and pasting a bare URL over a selection. There's
 * no option to turn this rule off, so it's dropped by extending the node.
 */
const LinkWithoutPasteRule = Link.extend({
  addPasteRules() {
    return [];
  },
});

function createLinkShortcut(onLinkShortcut: () => void) {
  return Extension.create({
    name: 'linkShortcut',
    addKeyboardShortcuts() {
      return {
        'Mod-k': () => {
          onLinkShortcut();
          return true;
        },
      };
    },
  });
}

/**
 * Extension lineup for the rich text editor: CommonMark + GFM only, so
 * everything the user can create survives a markdown round-trip.
 *
 * StarterKit in this Tiptap version already bundles `underline`, `link`,
 * and `listKeymap`. `underline` is disabled (no markdown form), `link` is
 * disabled and re-added as its own extension so `Link` can take
 * editor-specific options, `codeBlock` is disabled and replaced by
 * `CodeBlockLowlight` for syntax highlighting, while `listKeymap` is left on
 * StarterKit's default rather than importing a second copy.
 */
export function createRichTextEditorExtensions(
  options: RichTextEditorKitOptions = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4] },
      link: false,
      underline: false,
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? '',
    }),
    LinkWithoutPasteRule.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
    }),
    Image,
    CodeBlockLowlight.configure({ lowlight }),
    Typography,
    TaskList,
    TaskItem,
    TableKit.configure({
      table: { resizable: false },
    }),
    LegacyMarks,
    ...(options.hasMarkdown ? [Markdown] : []),
    ...(options.slashCommand ? [SlashCommand.configure({ handlers: options.slashCommand })] : []),
    ...(options.onLinkShortcut ? [createLinkShortcut(options.onLinkShortcut)] : []),
  ];
}
