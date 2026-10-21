import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { applyBlockType, type BlockType } from './commands';

export type SlashCommandId = BlockType | 'horizontalRule' | 'table' | 'image';

export interface SlashCommandSession {
  query: string;
  clientRect: () => DOMRect | null;
  /** Deletes the typed "/query" and runs the command. For 'image' it only deletes the text. */
  select: (id: SlashCommandId) => void;
}

export interface SlashCommandHandlers {
  onStart: (session: SlashCommandSession) => void;
  onUpdate: (session: SlashCommandSession) => void;
  /** Return true when the menu handled the key. Escape is handled by the extension. */
  onKeyDown: (event: KeyboardEvent) => boolean;
  onExit: () => void;
}

export interface SlashCommandOptions {
  handlers: SlashCommandHandlers;
}

const NO_HANDLERS: SlashCommandHandlers = {
  onStart: () => {},
  onUpdate: () => {},
  onKeyDown: () => false,
  onExit: () => {},
};

type SlashSuggestionProps = SuggestionProps<never, SlashCommandId>;

function runSlashCommand(editor: Editor, range: Range, id: SlashCommandId): void {
  const chain = editor.chain().focus().deleteRange(range);
  switch (id) {
    case 'image':
      chain.run();
      return;
    case 'horizontalRule':
      chain.setHorizontalRule().run();
      return;
    case 'table':
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      return;
    default:
      applyBlockType(editor, chain, id).run();
  }
}

function toSession(props: SlashSuggestionProps): SlashCommandSession {
  return {
    query: props.query,
    clientRect: () => props.clientRect?.() ?? null,
    select: props.command,
  };
}

/**
 * Opens on "/" at the start of a block or after a space. Renders nothing, the
 * host draws the menu from the handlers.
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { handlers: NO_HANDLERS };
  },

  addProseMirrorPlugins() {
    const { handlers } = this.options;
    return [
      Suggestion<never, SlashCommandId>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        allow: ({ state }) => {
          const { $from } = state.selection;
          const insideCode = $from.parent.type.spec.code === true;
          const insideInlineCode = $from.marks().some((mark) => mark.type.name === 'code');
          return !insideCode && !insideInlineCode;
        },
        command: ({ editor, range, props }) => runSlashCommand(editor, range, props),
        render: () => ({
          onStart: (props) => handlers.onStart(toSession(props)),
          onUpdate: (props) => handlers.onUpdate(toSession(props)),
          onKeyDown: ({ event }) => event.key !== 'Escape' && handlers.onKeyDown(event),
          onExit: () => handlers.onExit(),
        }),
      }),
    ];
  },
});
