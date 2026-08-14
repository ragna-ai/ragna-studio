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

export interface UseEmailComposeEditorOptions {
  content: string;
  placeholder?: string;
  autofocus?: 'start' | 'end';
  onUpdate?: (markdown: string) => void;
}

/**
 * One Tiptap Editor instance for the compose/reply/draft-edit box
 * (docs/email/prd.md, "Content pipeline": editor is markdown-native, HTML
 * only appears at send time via `editor.getHTML()`). Same command surface
 * as ~/features/document/composables/useDocumentEditor.ts and
 * ~/features/task/composables/useTaskDescriptionEditor.ts (mirrored, not
 * shared, same reasoning as the task composable: each feature mounts its
 * own instance), so it drives the document feature's EditorMenu.vue toolbar
 * unchanged.
 */
export function useEmailComposeEditor(options: UseEmailComposeEditorOptions) {
  const editor = shallowRef<Editor>();

  onMounted(() => {
    editor.value = createDocumentEditor({
      content: options.content,
      placeholder: options.placeholder,
      autofocus: options.autofocus,
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

  /** Serializes the current content back to markdown, sent to the API alongside the editor's HTML. */
  function getMarkdown(): string {
    return getDocumentMarkdown(requireEditor());
  }

  /** The wire format for `html`: `editor.getHTML()` is Tiptap-core, re-exported through `Editor`. */
  function getHtml(): string {
    return requireEditor().getHTML();
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

  /** Replaces the editor's content, e.g. hydrating an AI draft's markdown once it arrives. */
  function setContent(markdown: string) {
    requireEditor().commands.setContent(markdown);
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
    getHtml,
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
    setContent,
  };
}

export type EmailComposeEditorController = ReturnType<typeof useEmailComposeEditor>;
