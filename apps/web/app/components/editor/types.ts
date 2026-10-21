import type {
  BlockType,
  ContentType,
  Editor,
  SlashCommandId,
  TextFormat,
} from '@repo/editor';
import type { Ref, ShallowRef } from 'vue';

export interface SlashMenuState {
  query: string;
  clientRect: () => DOMRect | null;
  select: (id: SlashCommandId) => void;
}

export type SlashKeyHandler = (event: KeyboardEvent) => boolean;

export interface RichTextEditorController {
  editor: ShallowRef<Editor | undefined>;
  contentType: ContentType;
  getContent: () => string;
  setContent: (content: string) => void;
  getText: () => string;
  focusEnd: () => void;

  formatText: (format: TextFormat) => boolean;
  setBlockType: (type: BlockType) => boolean;
  activeBlockType: () => BlockType | 'mixed';
  setHorizontalRule: () => boolean;

  isInTable: () => boolean;
  insertTable: () => boolean;
  addRowBefore: () => boolean;
  addRowAfter: () => boolean;
  deleteRow: () => boolean;
  addColumnBefore: () => boolean;
  addColumnAfter: () => boolean;
  deleteColumn: () => boolean;
  deleteTable: () => boolean;

  getLink: () => string;
  setLink: (url: string) => boolean;
  unsetLink: () => boolean;
  insertImage: (url: string) => boolean;

  /** Opened by Mod-k, shown by the bubble menu. */
  isLinkFormOpen: Ref<boolean>;
  /** Opened by the slash menu's image item, shown by the slash menu. */
  isImageFormOpen: Ref<boolean>;
  /** `null` while the slash menu is closed. */
  slashMenu: Readonly<ShallowRef<SlashMenuState | null>>;
  /** The slash menu registers its arrow/Enter handler while mounted. */
  setSlashKeyHandler: (handler: SlashKeyHandler | null) => void;
}

export interface UseRichTextEditorOptions {
  content: string;
  contentType: ContentType;
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (value: string) => void;
}
