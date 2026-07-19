<script setup lang="ts">
import { FolderCogIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { toast } from 'vue-sonner';
import DocumentCreateDialog from '~/features/document/components/DocumentCreateDialog.vue';
import DocumentTable from '~/features/document/components/DocumentTable.vue';
import FolderManageDialog from '~/features/document/components/FolderManageDialog.vue';
import {
  useDeleteDocument,
  useGetDocuments,
  useUpdateDocument,
} from '~/features/document/composables/useDocumentApi';
import { useGetFolders } from '~/features/document/composables/useFolderApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

// Refs
const isCreateDialogOpen = ref(false);
const isFolderManageOpen = ref(false);

// Composables
// A workspace is always active (docs/api-standards/prd.md): activeWorkspaceId
// is only briefly '' on first load, before the workspace list resolves it.
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { confirm } = useConfirmDialog();
const { t } = useI18n();

const { data: documentsData, error: documentsError } =
  useGetDocuments(activeWorkspaceId);
const { data: foldersData } = useGetFolders(activeWorkspaceId);
const { mutateAsync: deleteDocument } = useDeleteDocument(activeWorkspaceId);
const { mutate: updateDocument } = useUpdateDocument(activeWorkspaceId);

useHead({
  title: t('document.list.title'),
});

// Computed
const documents = computed(() => documentsData.value?.documents ?? []);
const folders = computed(() => foldersData.value?.folders ?? []);

// Functions
async function handleDeleteDocument(documentId: string) {
  const confirmed = await confirm({
    title: t('document.deleteConfirm.title'),
    message: t('document.deleteConfirm.message'),
    confirmLabel: t('document.deleteConfirm.confirm'),
    cancelLabel: t('document.deleteConfirm.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteDocument(documentId);
}

function handleMoveDocument(payload: {
  documentId: string;
  folderId: string | null;
}) {
  updateDocument(payload, {
    onSuccess: () => toast.success(t('document.list.item.moveSuccess')),
  });
}
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="t('document.list.title')"
          :subtitle="t('document.list.subtitle')"
        >
          <template #button>
            <div class="flex gap-2">
              <Button
                variant="secondary"
                :disabled="!activeWorkspaceId"
                @click="isFolderManageOpen = true"
              >
                <FolderCogIcon class="mr-2 size-4 stroke-1.5" />
                {{ t('folder.manage.title') }}
              </Button>
              <Button
                variant="secondary"
                :disabled="!activeWorkspaceId"
                @click="isCreateDialogOpen = true"
              >
                {{ t('document.list.newDocument') }}
              </Button>
            </div>
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>

    <div class="px-5">
      <div
        v-if="!activeWorkspaceId"
        class="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        {{ t('document.list.loading') }}
      </div>
      <div v-else-if="documentsData">
        <DocumentTable
          :documents="documents"
          :folders="folders"
          @delete-document="handleDeleteDocument"
          @move-document="handleMoveDocument"
        />
      </div>
      <div v-else-if="documentsError">
        <p class="text-sm text-stone-500">
          {{ documentsError.message || t('document.list.loadError') }}
        </p>
      </div>
      <div v-else>
        <p class="text-sm text-stone-500">{{ t('document.list.loading') }}</p>
      </div>
    </div>

    <template v-if="activeWorkspaceId">
      <DocumentCreateDialog
        v-model:open="isCreateDialogOpen"
        :workspace-id="activeWorkspaceId"
        :folders="folders"
      />
      <FolderManageDialog
        v-model:open="isFolderManageOpen"
        :workspace-id="activeWorkspaceId"
        :folders="folders"
      />
    </template>
  </SectionWrapper>
</template>
