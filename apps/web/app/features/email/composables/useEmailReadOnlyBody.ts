import { createDocumentEditor, type Editor } from '@repo/editor';

/**
 * Renders a message's markdown `textBody` read-only through the same
 * `@repo/editor` instance used everywhere else in the app
 * (docs/email/prd.md, "Content pipeline": "User reading = user editing").
 * `createDocumentEditor` doesn't expose an `editable` constructor option
 * (see CreateDocumentEditorOptions in packages/editor/src/document-editor.ts),
 * so this flips Tiptap's own `setEditable(false)` right after mount instead:
 * standard `Editor` API, no package change needed.
 */
export function useEmailReadOnlyBody(markdown: string) {
  const editor = shallowRef<Editor>();

  onMounted(() => {
    const instance = createDocumentEditor({ content: markdown });
    instance.setEditable(false);
    editor.value = instance;
  });

  onBeforeUnmount(() => {
    editor.value?.destroy();
    editor.value = undefined;
  });

  return { editor };
}
