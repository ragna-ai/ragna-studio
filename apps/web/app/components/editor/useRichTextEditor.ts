import {
  addColumnAfter as addColumnAfterCommand,
  addColumnBefore as addColumnBeforeCommand,
  addRowAfter as addRowAfterCommand,
  addRowBefore as addRowBeforeCommand,
  createRichTextEditor,
  deleteColumn as deleteColumnCommand,
  deleteRow as deleteRowCommand,
  deleteTable as deleteTableCommand,
  focusEnd as focusEndCommand,
  formatText as formatTextCommand,
  getActiveBlockType,
  getEditorContent,
  getEditorText,
  getLinkUrl,
  insertImage as insertImageCommand,
  insertTable as insertTableCommand,
  isInsideTable,
  setBlockType as setBlockTypeCommand,
  setEditorContent,
  setHorizontalRule as setHorizontalRuleCommand,
  setLink as setLinkCommand,
  unsetLink as unsetLinkCommand,
  type BlockType,
  type Editor,
  type SlashCommandHandlers,
  type SlashCommandId,
  type SlashCommandSession,
  type TextFormat,
} from '@repo/editor';
import type {
  RichTextEditorController,
  SlashKeyHandler,
  SlashMenuState,
  UseRichTextEditorOptions,
} from './types';

/**
 * Owns one Tiptap Editor instance for the lifetime of the calling component.
 * The command chains live in @repo/editor: apps/web has no @tiptap dependency
 * of its own, so it can't see the commands Tiptap extensions add via module
 * augmentation.
 */
export function useRichTextEditor(
  options: UseRichTextEditorOptions,
): RichTextEditorController {
  const editor = shallowRef<Editor>();
  const isLinkFormOpen = ref(false);
  const isImageFormOpen = ref(false);
  const slashMenu = shallowRef<SlashMenuState | null>(null);
  let slashKeyHandler: SlashKeyHandler | null = null;

  const slashCommand: SlashCommandHandlers = {
    onStart: publishSlashMenu,
    onUpdate: publishSlashMenu,
    onKeyDown: (event) => slashKeyHandler?.(event) ?? false,
    onExit: () => {
      slashMenu.value = null;
    },
  };

  onMounted(() => {
    editor.value = createRichTextEditor({
      content: options.content,
      contentType: options.contentType,
      placeholder: options.placeholder,
      autofocus: options.autofocus,
      onUpdate: options.onUpdate,
      slashCommand,
      onLinkShortcut: openLinkFormIfApplicable,
    });
  });

  onBeforeUnmount(() => {
    editor.value?.destroy();
    editor.value = undefined;
  });

  function requireEditor(): Editor {
    if (!editor.value) {
      throw new Error('Editor instance is not available');
    }
    return editor.value;
  }

  function publishSlashMenu(session: SlashCommandSession) {
    slashMenu.value = {
      query: session.query,
      clientRect: session.clientRect,
      select: (id: SlashCommandId) => {
        session.select(id);
        if (id === 'image') {
          isImageFormOpen.value = true;
        }
      },
    };
  }

  function openLinkFormIfApplicable() {
    const current = requireEditor();
    if (current.isActive('codeBlock')) {
      return;
    }
    const hasSelection = !current.state.selection.empty;
    if (hasSelection || getLinkUrl(current)) {
      isLinkFormOpen.value = true;
    }
  }

  function setSlashKeyHandler(handler: SlashKeyHandler | null) {
    slashKeyHandler = handler;
  }

  function getContent(): string {
    return getEditorContent(requireEditor(), options.contentType);
  }

  function setContent(content: string) {
    setEditorContent(requireEditor(), content, options.contentType);
  }

  function getText(): string {
    return getEditorText(requireEditor());
  }

  function focusEnd() {
    focusEndCommand(requireEditor());
  }

  function formatText(format: TextFormat) {
    return formatTextCommand(requireEditor(), format);
  }

  function setBlockType(type: BlockType) {
    return setBlockTypeCommand(requireEditor(), type);
  }

  function activeBlockType() {
    return getActiveBlockType(requireEditor());
  }

  function setHorizontalRule() {
    return setHorizontalRuleCommand(requireEditor());
  }

  function isInTable(): boolean {
    return isInsideTable(requireEditor());
  }

  function insertTable() {
    return insertTableCommand(requireEditor());
  }

  function addRowBefore() {
    return addRowBeforeCommand(requireEditor());
  }

  function addRowAfter() {
    return addRowAfterCommand(requireEditor());
  }

  function deleteRow() {
    return deleteRowCommand(requireEditor());
  }

  function addColumnBefore() {
    return addColumnBeforeCommand(requireEditor());
  }

  function addColumnAfter() {
    return addColumnAfterCommand(requireEditor());
  }

  function deleteColumn() {
    return deleteColumnCommand(requireEditor());
  }

  function deleteTable() {
    return deleteTableCommand(requireEditor());
  }

  function getLink(): string {
    return getLinkUrl(requireEditor());
  }

  function setLink(url: string) {
    return setLinkCommand(requireEditor(), url);
  }

  function unsetLink() {
    return unsetLinkCommand(requireEditor());
  }

  function insertImage(url: string) {
    return insertImageCommand(requireEditor(), url);
  }

  return {
    editor,
    contentType: options.contentType,
    getContent,
    setContent,
    getText,
    focusEnd,
    formatText,
    setBlockType,
    activeBlockType,
    setHorizontalRule,
    isInTable,
    insertTable,
    addRowBefore,
    addRowAfter,
    deleteRow,
    addColumnBefore,
    addColumnAfter,
    deleteColumn,
    deleteTable,
    getLink,
    setLink,
    unsetLink,
    insertImage,
    isLinkFormOpen,
    isImageFormOpen,
    slashMenu,
    setSlashKeyHandler,
  };
}
