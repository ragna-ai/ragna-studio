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
export function useTaskDescriptionEditor(options: UseTaskDescriptionEditorOptions) {
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

export type TaskDescriptionEditorController = ReturnType<
  typeof useTaskDescriptionEditor
>;
