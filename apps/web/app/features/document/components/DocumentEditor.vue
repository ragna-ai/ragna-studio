<script setup lang="ts">
import { DownloadIcon } from '@lucide/vue';
import { EditorContent, focusEnd } from '@repo/editor';
import EditorMenu from '~/features/document/components/EditorMenu.vue';
import {
  useExportDocument,
  useUpdateDocument,
} from '~/features/document/composables/useDocumentApi';
import { useDocumentEditor } from '~/features/document/composables/useDocumentEditor';
import type { Document, DocumentExportFormat } from '~/features/document/types';

// Props
const props = defineProps<{ document: Document }>();

// Refs
const title = ref(props.document.title);
const latestContent = ref(props.document.content);
const isDirty = ref(false);

// Composables
const { t } = useI18n();
const { mutate: saveDocument } = useUpdateDocument();
const { mutate: exportDocument, isPending: isExporting } = useExportDocument(
  () => props.document.id,
  title,
);

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

function handleExport(format: DocumentExportFormat) {
  exportDocument({ format });
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
      <div class="flex shrink-0 items-center gap-3">
        <p class="text-xs text-muted-foreground">
          {{
            saveStatus === 'saving'
              ? t('document.editor.saveStatus.saving')
              : t('document.editor.saveStatus.saved')
          }}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" :disabled="isExporting">
              <Spinner v-if="isExporting" class="mr-2" />
              <DownloadIcon v-else class="size-4 stroke-1.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="handleExport('md')">
              {{ t('document.editor.export.markdown') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleExport('txt')">
              {{ t('document.editor.export.text') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleExport('pdf')">
              {{ t('document.editor.export.pdf') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleExport('docx')">
              {{ t('document.editor.export.word') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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

<style src="./DocumentEditor.css"></style>
