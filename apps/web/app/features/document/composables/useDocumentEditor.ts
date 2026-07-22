import {
  addColumnAfter as addColumnAfterCommand,
  addColumnBefore as addColumnBeforeCommand,
  addRowAfter as addRowAfterCommand,
  addRowBefore as addRowBeforeCommand,
  createDocumentEditor,
  cycleList as cycleListCommand,
  cycleTextOrientation as cycleTextOrientationCommand,
  deleteColumn as deleteColumnCommand,
  deleteRow as deleteRowCommand,
  deleteTable as deleteTableCommand,
  formatText as formatTextCommand,
  getCharacterCount,
  getDocumentMarkdown,
  getLinkUrl,
  getWordCount,
  insertImage as insertImageCommand,
  insertTable as insertTableCommand,
  isInsideTable,
  redo as redoCommand,
  setLink as setLinkCommand,
  toggleCodeBlock as toggleCodeBlockCommand,
  toggleHeaderColumn as toggleHeaderColumnCommand,
  toggleHeaderRow as toggleHeaderRowCommand,
  toggleTaskList as toggleTaskListCommand,
  undo as undoCommand,
  unsetLink as unsetLinkCommand,
  type Editor,
  type TextFormat,
} from '@repo/editor';

export interface UseDocumentEditorOptions {
  content: string;
  placeholder?: string;
  onUpdate?: (markdown: string) => void;
}

/**
 * Owns one Tiptap Editor instance for the lifetime of the component that
 * calls this (ported from the prior-art editor.store.ts formatting
 * commands, without the Pinia singleton: each document page gets its own
 * instance instead of sharing one global editor). The actual command chains
 * live in @repo/editor (see commands.ts there): apps/web has no @tiptap
 * dependency of its own, so it can't see the ChainedCommands methods that
 * Tiptap extensions add via ambient module augmentation.
 */
export function useDocumentEditor(options: UseDocumentEditorOptions) {
  const editor = shallowRef<Editor>();

  onMounted(() => {
    editor.value = createDocumentEditor({
      content: options.content,
      placeholder: options.placeholder,
      autofocus: 'start',
      onUpdate: options.onUpdate,
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

  function formatText(format: TextFormat) {
    return formatTextCommand(requireEditor(), format);
  }

  function cycleList() {
    return cycleListCommand(requireEditor());
  }

  function cycleTextOrientation() {
    return cycleTextOrientationCommand(requireEditor());
  }

  function toggleTaskList() {
    return toggleTaskListCommand(requireEditor());
  }

  function toggleCodeBlock() {
    return toggleCodeBlockCommand(requireEditor());
  }

  function undo() {
    return undoCommand(requireEditor());
  }

  function redo() {
    return redoCommand(requireEditor());
  }

  function getMarkdown(): string {
    return getDocumentMarkdown(requireEditor());
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

  function toggleHeaderRow() {
    return toggleHeaderRowCommand(requireEditor());
  }

  function toggleHeaderColumn() {
    return toggleHeaderColumnCommand(requireEditor());
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

  function characterCount(): number {
    return getCharacterCount(requireEditor());
  }

  function wordCount(): number {
    return getWordCount(requireEditor());
  }

  return {
    editor,
    formatText,
    cycleList,
    cycleTextOrientation,
    toggleTaskList,
    toggleCodeBlock,
    undo,
    redo,
    getMarkdown,
    isInTable,
    insertTable,
    addRowBefore,
    addRowAfter,
    deleteRow,
    addColumnBefore,
    addColumnAfter,
    deleteColumn,
    deleteTable,
    toggleHeaderRow,
    toggleHeaderColumn,
    getLink,
    setLink,
    unsetLink,
    insertImage,
    characterCount,
    wordCount,
  };
}

export type DocumentEditorController = ReturnType<typeof useDocumentEditor>;
