<script setup lang="ts">
import { DownloadIcon, SaveCheckIcon, SavePenIcon } from '@lucide/vue';
import RichTextEditor from '~/components/editor/RichTextEditor.vue';
import { useRichTextEditor } from '~/components/editor/useRichTextEditor';
import {
  useExportDocument,
  useUpdateDocument,
} from '~/features/document/composables/useDocumentApi';
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

const controller = useRichTextEditor({
  content: props.document.content,
  contentType: 'markdown',
  autofocus: 'start',
  placeholder: t('document.editor.contentPlaceholder'),
  onUpdate: (markdown) => {
    latestContent.value = markdown;
    isDirty.value = true;
    debouncedSave();
  },
});

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
        <div class="text-muted-foreground">
          <SavePenIcon
            v-if="saveStatus === 'saving'"
            class="size-4 stroke-1.5"
          />
          <SaveCheckIcon v-else class="size-4 stroke-1.5" />
        </div>
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
    <div class="min-h-0 flex-1 overflow-y-auto bg-stone-50 pb-10">
      <RichTextEditor
        :controller="controller"
        class="mx-auto mt-8 flex min-h-full max-w-4xl flex-col rounded-sm border bg-white px-16 py-12 shadow-md"
      />
    </div>
  </div>
</template>
