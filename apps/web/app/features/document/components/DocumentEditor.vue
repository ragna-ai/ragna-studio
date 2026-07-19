<script setup lang="ts">
import { EditorContent, focusEnd } from '@repo/editor';
import EditorMenu from '~/features/document/components/EditorMenu.vue';
import { useUpdateDocument } from '~/features/document/composables/useDocumentApi';
import { useDocumentEditor } from '~/features/document/composables/useDocumentEditor';
import type { Document } from '~/features/document/types';

// Props
const props = defineProps<{ document: Document }>();

// Refs
const title = ref(props.document.title);
const latestContent = ref(props.document.content);
const isDirty = ref(false);

// Composables
const { t } = useI18n();
const { mutate: saveDocument } = useUpdateDocument();

const controller = useDocumentEditor({
  content: props.document.content,
  placeholder: t('document.editor.contentPlaceholder'),
  onUpdate: (markdown) => {
    latestContent.value = markdown;
    isDirty.value = true;
    debouncedSave();
  },
});
const editor = controller.editor;

// Computed
const saveStatus = computed<'saved' | 'saving'>(() =>
  isDirty.value ? 'saving' : 'saved',
);
const ancestorItems = computed(() => [
  { label: t('document.list.title'), to: '/document' },
]);

// Functions
// Content edits (onUpdate above) and title edits (InlineNameField's `save`,
// which only fires on a real committed change) share one debounced PATCH so
// they never race each other with separate in-flight requests.
const debouncedSave = useDebounceFn(() => {
  saveDocument(
    {
      documentId: props.document.id,
      title: title.value,
      content: latestContent.value,
    },
    { onSuccess: () => (isDirty.value = false) },
  );
}, 1000);

function handleTitleSave() {
  isDirty.value = true;
  debouncedSave();
}

// Presses starting on the sheet's padding (outside the ProseMirror element)
// land here via `.self`; presses inside the editor place the caret
// themselves. Bound to mousedown, not click: a click fires on the common
// ancestor of press and release, so ending a text-selection drag over the
// padding would collapse the selection to the end. The `.prevent` stops the
// browser from starting a native selection on the padding before the
// programmatic focus runs.
function focusEditorEnd() {
  if (editor.value) {
    focusEnd(editor.value);
  }
}

// Hooks
// Flushes a pending edit immediately on navigation away, instead of losing
// it to the still-pending 1s debounce.
onBeforeUnmount(() => {
  if (isDirty.value) {
    saveDocument({
      documentId: props.document.id,
      title: title.value,
      content: latestContent.value,
    });
  }
});
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-center justify-between border-b px-4 py-2">
      <PageBreadcrumb :items="ancestorItems">
        <template #current>
          <InlineNameField
            v-model:name="title"
            :label="t('document.editor.rename')"
            @save="handleTitleSave"
          />
        </template>
      </PageBreadcrumb>
      <p class="text-xs text-muted-foreground">
        {{
          saveStatus === 'saving'
            ? t('document.editor.saveStatus.saving')
            : t('document.editor.saveStatus.saved')
        }}
      </p>
    </header>
    <div class="border-b">
      <EditorMenu :controller="controller" />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto bg-stone-50 pb-10">
      <div
        class="document-sheet mx-auto mt-8 flex min-h-full max-w-4xl cursor-text flex-col rounded-sm border bg-white px-16 py-12 shadow-md"
        @mousedown.self.prevent="focusEditorEnd"
      >
        <EditorContent :editor="editor" class="flex flex-1 flex-col" />
      </div>
    </div>
  </div>
</template>

<!-- Not scoped: the ProseMirror element is rendered by Tiptap, outside Vue's
     scoping. Tailwind's preflight strips heading/list styles and Tiptap ships
     no CSS of its own, so the document typography, the editable area's fill
     height, and the Placeholder pseudo-element all live here, namespaced
     under .document-sheet. -->
<style>
.document-sheet .ProseMirror {
  flex: 1;
  outline: none;
}

.document-sheet .ProseMirror > * + * {
  margin-top: 0.75em;
}

.document-sheet .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--muted-foreground);
  float: left;
  height: 0;
  pointer-events: none;
}

.document-sheet .ProseMirror h1 {
  font-size: 1.875rem;
  font-weight: 700;
  line-height: 1.25;
  margin-top: 1.25em;
}

.document-sheet .ProseMirror h2 {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.25em;
}

.document-sheet .ProseMirror h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1em;
}

.document-sheet .ProseMirror h1:first-child,
.document-sheet .ProseMirror h2:first-child,
.document-sheet .ProseMirror h3:first-child {
  margin-top: 0;
}

.document-sheet .ProseMirror ul {
  list-style: disc;
  padding-left: 1.5rem;
}

.document-sheet .ProseMirror ol {
  list-style: decimal;
  padding-left: 1.5rem;
}

.document-sheet .ProseMirror li p {
  margin: 0;
}

.document-sheet .ProseMirror ul[data-type='taskList'] {
  list-style: none;
  padding-left: 0;
}

.document-sheet .ProseMirror li[data-type='taskItem'] {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.document-sheet .ProseMirror blockquote {
  border-left: 3px solid var(--border);
  padding-left: 1rem;
  color: var(--muted-foreground);
}

.document-sheet .ProseMirror hr {
  border-top: 1px solid var(--border);
  margin: 1.5rem 0;
}

.document-sheet .ProseMirror code {
  background: var(--muted);
  border-radius: var(--radius-sm);
  padding: 0.15em 0.4em;
  font-size: 0.9em;
}

.document-sheet .ProseMirror a {
  color: var(--primary);
  text-decoration: underline;
}
</style>
