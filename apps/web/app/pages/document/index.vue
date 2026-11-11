<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { toast } from '~/lib/toast';
import DocumentCreateDialog from '~/features/document/components/DocumentCreateDialog.vue';
import DocumentTable, {
  type MoveDocumentPayload,
} from '~/features/document/components/DocumentTable.vue';
import FolderNameDialog from '~/features/document/components/FolderNameDialog.vue';
import { ROOT_FOLDER_FILTER } from '~/features/document/composables/queryKeys';
import {
  useDeleteDocument,
  useGetDocumentsInFolder,
  useUpdateDocument,
} from '~/features/document/composables/useDocumentApi';
import {
  useDeleteFolder,
  useGetFolder,
  useGetFolders,
} from '~/features/document/composables/useFolderApi';
import type { Folder } from '~/features/document/types';
import { isNotFoundError } from '~/lib/api-error';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

// Refs
const isCreateDialogOpen = ref(false);
const isCreateFolderOpen = ref(false);
const folderToRename = ref<Folder | null>(null);
const isRenameFolderOpen = ref(false);

// Composables
// A workspace is always active: activeWorkspaceId
// is only briefly '' on first load, before the workspace list resolves it.
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const route = useRoute();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

const openFolderId = computed(() => {
  const folder = route.query.folder;
  return typeof folder === 'string' && folder !== '' ? folder : null;
});
const documentFilter = computed(() => openFolderId.value ?? ROOT_FOLDER_FILTER);

const { data: documentsData, error: documentsError } =
  useGetDocumentsInFolder(documentFilter);
const { data: foldersData } = useGetFolders();
const { data: openFolderData, error: openFolderError } =
  useGetFolder(openFolderId);
const { mutateAsync: deleteDocument } = useDeleteDocument();
const { mutate: updateDocument } = useUpdateDocument();
const { mutateAsync: deleteFolder } = useDeleteFolder();

useHead({
  title: t('document.list.title'),
});

// Computed
const documents = computed(() => documentsData.value?.documents ?? []);
const folders = computed(() => foldersData.value?.folders ?? []);
const folderRows = computed(() => (openFolderId.value ? [] : folders.value));
const isFolderNotFound = computed(
  () => !!openFolderId.value && isNotFoundError(openFolderError.value),
);
const isListEmpty = computed(
  () => documents.value.length === 0 && folderRows.value.length === 0,
);
const crumbs = computed<PageCrumb[]>(() =>
  openFolderId.value
    ? [
        { label: t('document.list.title'), to: '/document' },
        { label: openFolderData.value?.folder.name ?? '' },
      ]
    : [],
);

// Functions
function openFolder(folderId: string) {
  navigateTo({ path: '/document', query: { folder: folderId } });
}

function startRenameFolder(folder: Folder) {
  folderToRename.value = folder;
  isRenameFolderOpen.value = true;
}

async function handleDeleteFolder(folder: Folder) {
  const confirmed = await confirm({
    title: t('folder.deleteConfirm.title'),
    message: t('folder.deleteConfirm.message', { name: folder.name }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteFolder(folder.id);
}

async function handleDeleteDocument(documentId: string) {
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
  await deleteDocument(documentId);
}

function handleMoveDocument(payload: MoveDocumentPayload) {
  updateDocument(payload, {
    onSuccess: () => toast.success(t('document.list.item.moveSuccess')),
  });
}
</script>

<template>
  <PagePanel :crumbs="crumbs">
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
                  variant="outline"
                  :disabled="!activeWorkspaceId"
                  leading-icon="hugeicons:folder-add"
                  @click="isCreateFolderOpen = true"
                >
                  {{ t('folder.newFolder') }}
                </Button>
                <Button
                  variant="outline"
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

      <div class="space-y-4 px-5">
        <div
          v-if="!activeWorkspaceId"
          class="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          {{ t('document.list.loading') }}
        </div>

        <div v-else-if="isFolderNotFound" class="space-y-3">
          <p class="text-sm text-muted-foreground">
            {{ t('folder.notFound.message') }}
          </p>
          <Button variant="outline" as-child>
            <NuxtLinkLocale to="/document">
              {{ t('folder.notFound.back') }}
            </NuxtLinkLocale>
          </Button>
        </div>

        <template v-else-if="documentsData">
          <div
            v-if="isListEmpty"
            class="space-y-3 rounded-lg border p-6 text-sm text-muted-foreground"
          >
            <p>
              {{
                openFolderId
                  ? t('folder.emptyFolder')
                  : t('document.list.emptyWorkspace')
              }}
            </p>
            <div class="flex gap-2">
              <Button variant="outline" @click="isCreateDialogOpen = true">
                {{ t('document.list.newDocument') }}
              </Button>
              <Button
                v-if="!openFolderId"
                variant="outline"
                @click="isCreateFolderOpen = true"
              >
                {{ t('folder.newFolder') }}
              </Button>
            </div>
          </div>
          <DocumentTable
            v-else
            :documents="documents"
            :folder-rows="folderRows"
            :move-targets="folders"
            @open-folder="openFolder"
            @rename-folder="startRenameFolder"
            @delete-folder="handleDeleteFolder"
            @delete-document="handleDeleteDocument"
            @move-document="handleMoveDocument"
          />
        </template>

        <div v-else-if="documentsError">
          <p class="text-sm text-stone-500">
            {{ documentsError.message || t('document.list.loadError') }}
          </p>
        </div>
      </div>

      <template v-if="activeWorkspaceId">
        <DocumentCreateDialog
          v-model:open="isCreateDialogOpen"
          :folders="folders"
          :folder-id="openFolderId"
        />
        <FolderNameDialog v-model:open="isCreateFolderOpen" />
        <FolderNameDialog
          v-model:open="isRenameFolderOpen"
          :folder="folderToRename ?? undefined"
        />
      </template>
    </SectionWrapper>
  </PagePanel>
</template>
