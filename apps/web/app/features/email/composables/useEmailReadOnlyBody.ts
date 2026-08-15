import { createDocumentEditor, type Editor } from '@repo/editor';

/**
 * Renders an oversized draft's HTML `content` read-only through the same
 * `@repo/editor` instance used everywhere else in the app (EmailComposer.vue's
 * only caller: the `isEmailDraftContentUnsafeToEdit` fallback branch).
 * `createDocumentEditor` doesn't expose an `editable` constructor option
 * (see CreateDocumentEditorOptions in packages/editor/src/document-editor.ts),
 * so this flips Tiptap's own `setEditable(false)` right after mount instead:
 * standard `Editor` API, no package change needed. `contentType: 'html'`
 * matches `useEmailComposeEditor.ts`'s editable instance - both read the
 * same (now-HTML) `content` field, this one just never lets it be edited.
 */
export function useEmailReadOnlyBody(html: string) {
  const editor = shallowRef<Editor>();

  onMounted(() => {
    const instance = createDocumentEditor({ content: html, contentType: 'html' });
    instance.setEditable(false);
    editor.value = instance;
  });

  onBeforeUnmount(() => {
    editor.value?.destroy();
    editor.value = undefined;
  });

  return { editor };
}
