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

export interface UseTaskDescriptionEditorOptions {
  content: string;
  placeholder?: string;
  onUpdate?: (markdown: string) => void;
}

/**
 * One Tiptap Editor instance for the task detail page's description field,
 * same markdown-in/markdown-out contract and command surface as
 * ~/features/document/composables/useDocumentEditor.ts (this mirrors it,
 * rather than sharing an instance, since each task detail page mounts its
 * own editor exactly like each document page does). apps/web has no @tiptap
 * dependency, so the command chains stay behind @repo/editor's typed
 * exports; this composable only owns the mount/unmount lifecycle and
 * exposes the same controller shape so it can drive the document feature's
 * EditorMenu.vue toolbar unchanged.
 */
export function useTaskDescriptionEditor(
  options: UseTaskDescriptionEditorOptions,
) {
  const editor = shallowRef<Editor>();

  onMounted(() => {
    editor.value = createDocumentEditor({
      content: options.content,
      placeholder: options.placeholder,
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

export type TaskDescriptionEditorController = ReturnType<
  typeof useTaskDescriptionEditor
>;
