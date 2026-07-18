import {
  createDocumentEditor,
  cycleList as cycleListCommand,
  cycleTextOrientation as cycleTextOrientationCommand,
  formatText as formatTextCommand,
  getDocumentMarkdown,
  redo as redoCommand,
  toggleTaskList as toggleTaskListCommand,
  undo as undoCommand,
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
      autofocus: 'end',
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

  function undo() {
    return undoCommand(requireEditor());
  }

  function redo() {
    return redoCommand(requireEditor());
  }

  function getMarkdown(): string {
    return getDocumentMarkdown(requireEditor());
  }

  return {
    editor,
    formatText,
    cycleList,
    cycleTextOrientation,
    toggleTaskList,
    undo,
    redo,
    getMarkdown,
  };
}

export type DocumentEditorController = ReturnType<typeof useDocumentEditor>;
