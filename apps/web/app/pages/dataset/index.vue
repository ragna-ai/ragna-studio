<script setup lang="ts">
import { storeToRefs } from 'pinia';
import DatasetManyTable from '~/features/dataset/components/DatasetManyTable.vue';
import { useDeleteDataset } from '~/features/dataset/composables/useDatasetApi';
import useDatasetList from '~/features/dataset/composables/useDatasetList';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

// Composables
// A workspace is always active (docs/api-standards/prd.md): activeWorkspaceId
// is only briefly '' on first load, before the workspace list resolves it.
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { page, limit, useGetAllDatasets } = useDatasetList();
const { data, error: datasetsError } = useGetAllDatasets();
const { mutateAsync: deleteDataset } = useDeleteDataset(activeWorkspaceId);
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('dataset.list.title'),
});

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });

// Functions
const handleDeleteDataset = async (datasetId: string) => {
  const confirmed = await confirm({
    title: t('dataset.deleteConfirm.title'),
    message: t('dataset.deleteConfirm.message'),
    confirmLabel: t('dataset.deleteConfirm.confirm'),
    cancelLabel: t('dataset.deleteConfirm.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteDataset(datasetId);
};
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle :title="t('dataset.list.title')" :subtitle="t('dataset.list.subtitle')">
          <template #button>
            <Button as-child variant="secondary">
              <NuxtLinkLocale to="/dataset/create">
                {{ t('dataset.list.newDataset') }}
              </NuxtLinkLocale>
            </Button>
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>
    <div v-if="data?.datasets" class="px-5">
      <DatasetManyTable
        :datasets="data.datasets"
        :meta="meta"
        @delete-dataset="handleDeleteDataset"
      />
      <div class="pb-10">
        <PaginateControls
          v-if="meta.totalCount > 10"
          v-model:page="page"
          v-model:limit="limit"
          :meta="meta"
        />
      </div>
    </div>
    <div v-else-if="datasetsError">
      <p class="text-sm text-stone-500">
        {{ datasetsError.message || t('dataset.list.loadError') }}
      </p>
    </div>
    <div v-else>
      <p class="text-sm text-stone-500">{{ t('dataset.list.loading') }}</p>
    </div>
  </SectionWrapper>
</template>
