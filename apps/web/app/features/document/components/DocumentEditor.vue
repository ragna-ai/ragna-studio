<script setup lang="ts">
import SaveStatusButton, {
  type SaveStatus,
} from '~/components/SaveStatusButton.vue';
import RichTextEditor from '~/components/editor/RichTextEditor.vue';
import { useRichTextEditor } from '~/components/editor/useRichTextEditor';
import DocumentActionsMenu from '~/features/document/components/DocumentActionsMenu.vue';
import DocumentRenameDialog from '~/features/document/components/DocumentRenameDialog.vue';
import {
  useDeleteDocument,
  useExportDocument,
  useUpdateDocument,
} from '~/features/document/composables/useDocumentApi';
import { useGetFolders } from '~/features/document/composables/useFolderApi';
import type { Document, DocumentExportFormat } from '~/features/document/types';
import { toast } from '~/lib/toast';

const AUTOSAVE_DELAY_MS = 1000;

// Props
const props = defineProps<{ document: Document }>();

// Refs
const latestContent = ref(props.document.content);
const isDirty = ref(false);
const hasSaveFailed = ref(false);
const isDeleted = ref(false);
const isRenameOpen = ref(false);

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { data: foldersData } = useGetFolders();
const { mutate: saveDocument } = useUpdateDocument();
const { mutate: moveDocument } = useUpdateDocument();
const { mutateAsync: deleteDocument } = useDeleteDocument();
const { mutate: exportDocument, isPending: isExporting } = useExportDocument(
  () => props.document.id,
  () => props.document.title,
);
const { start: scheduleSave, stop: cancelScheduledSave } = useTimeoutFn(
  saveNow,
  AUTOSAVE_DELAY_MS,
  { immediate: false },
);

const controller = useRichTextEditor({
  content: props.document.content,
  profile: 'document',
  autofocus: 'start',
  placeholder: t('document.editor.contentPlaceholder'),
  onUpdate: (markdown) => {
    latestContent.value = markdown;
    isDirty.value = true;
    hasSaveFailed.value = false;
    scheduleSave();
  },
});

// Computed
const saveStatus = computed<SaveStatus>(() => {
  if (hasSaveFailed.value) {
    return 'failed';
  }
  return isDirty.value ? 'saving' : 'saved';
});

const folders = computed(() => foldersData.value?.folders ?? []);

const crumbs = computed<PageCrumb[]>(() => {
  const { folderId, folderName, title } = props.document;
  const folderCrumbs: PageCrumb[] = folderId
    ? [{ label: folderName ?? '', to: `/document?folder=${folderId}` }]
    : [];
  return [
    { label: t('document.list.title'), to: '/document' },
    ...folderCrumbs,
    { label: title },
  ];
});

// Functions
// Sends the content only, so a save never overwrites a title renamed
// through the dialog.
function saveNow() {
  cancelScheduledSave();
  if (!isDirty.value) {
    return;
  }
  const content = latestContent.value;
  saveDocument(
    { documentId: props.document.id, content },
    {
      onSuccess: () => {
        hasSaveFailed.value = false;
        if (latestContent.value === content) {
          isDirty.value = false;
        }
      },
      onError: () => {
        hasSaveFailed.value = true;
      },
    },
  );
}

function handleExport(format: DocumentExportFormat) {
  exportDocument({ format });
}

function handleMove(folderId: string | null) {
  moveDocument(
    { documentId: props.document.id, folderId },
    { onSuccess: () => toast.success(t('document.list.item.moveSuccess')) },
  );
}

async function handleDelete() {
  const confirmed = await confirm({
    title: t('document.deleteConfirm.title'),
    message: t('document.deleteConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  const { id, folderId } = props.document;
  isDeleted.value = true;
  cancelScheduledSave();
  try {
    await deleteDocument(id);
  } catch {
    isDeleted.value = false;
    return;
  }
  await navigateTo(folderId ? `/document?folder=${folderId}` : '/document');
}

// Hooks
// Flushes a pending edit immediately on navigation away, instead of losing
// it to the still-pending autosave delay.
onBeforeUnmount(() => {
  cancelScheduledSave();
  if (isDirty.value && !isDeleted.value) {
    saveDocument({
      documentId: props.document.id,
      content: latestContent.value,
    });
  }
});
</script>

<template>
  <PagePanel>
    <template #header>
      <NavTopBar :crumbs="crumbs">
        <template #right>
          <SaveStatusButton :status="saveStatus" @save="saveNow" />
          <DocumentActionsMenu
            :folder-id="document.folderId"
            :folders="folders"
            :is-exporting="isExporting"
            @rename="isRenameOpen = true"
            @export="handleExport"
            @move="handleMove"
            @delete="handleDelete"
          />
        </template>
      </NavTopBar>
    </template>
    <div class="h-full min-h-0 overflow-y-auto bg-canvas pb-10">
      <RichTextEditor
        :controller="controller"
        class="mx-auto mt-8 flex min-h-full max-w-4xl flex-col rounded-sm border bg-background px-16 py-12 shadow-md"
      />
    </div>
    <DocumentRenameDialog v-model:open="isRenameOpen" :document="document" />
  </PagePanel>
</template>
