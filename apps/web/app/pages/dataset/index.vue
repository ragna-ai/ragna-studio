<script setup lang="ts">
import { NuxtLinkLocale } from '#components';
import DatasetManyTable from '~/features/dataset/components/DatasetManyTable.vue';
import { useDeleteDataset } from '~/features/dataset/composables/useDatasetApi';
import useDatasetList from '~/features/dataset/composables/useDatasetList';

// Composables
const { page, limit, useGetAllDatasets } = useDatasetList();
const { data, error, isPending, refetch } = useGetAllDatasets();
const { mutateAsync: deleteDataset } = useDeleteDataset();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('dataset.list.title'),
});

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });
const hasNoDatasetsAtAll = computed(() => data.value?.meta.totalCount === 0);
// The API returns no total row count, so the sum is only complete on a single page.
const rowSumSuffix = computed(() => {
  const datasets = data.value?.datasets ?? [];
  if (datasets.length !== meta.value.totalCount) {
    return undefined;
  }
  const rowCount = datasets.reduce((sum, dataset) => sum + dataset.rowCount, 0);
  return t('dataset.list.rowSum', { count: rowCount });
});

// Refs
const searchText = ref('');

// Functions
const handleDeleteDataset = async (datasetId: string) => {
  const confirmed = await confirm({
    title: t('dataset.deleteConfirm.title'),
    message: t('dataset.deleteConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteDataset(datasetId);
};
</script>

<template>
  <PagePanel>
    <SectionWrapper>
      <Heading>
        <template #top>
          <HeadingTitle
            :title="t('dataset.list.title')"
            :subtitle="t('dataset.list.subtitle')"
          >
            <template #button>
              <Button
                :as="NuxtLinkLocale"
                to="/dataset/create"
                leading-icon="hugeicons:plus-sign"
              >
                {{ t('dataset.list.newDataset') }}
              </Button>
            </template>
          </HeadingTitle>
        </template>
      </Heading>
      <div class="px-page pt-6">
        <ListErrorAlert
          v-if="error && !data"
          :title="t('dataset.list.loadError.title')"
          :description="t('dataset.list.loadError.description')"
          @retry="refetch()"
        />
        <Empty v-else-if="hasNoDatasetsAtAll">
          <EmptyMedia variant="icon">
            <Icon name="hugeicons:grid-table" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{{ t('dataset.list.empty') }}</EmptyTitle>
            <EmptyDescription>
              {{ t('dataset.list.emptyDescription') }}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              :as="NuxtLinkLocale"
              to="/dataset/create"
              leading-icon="hugeicons:plus-sign"
            >
              {{ t('dataset.list.newDataset') }}
            </Button>
          </EmptyContent>
        </Empty>
        <template v-else>
          <div class="flex h-11 items-center border-b">
            <ListSearch
              v-model="searchText"
              :placeholder="t('dataset.list.search')"
            />
          </div>
          <DatasetManyTable
            :datasets="data?.datasets ?? []"
            :is-loading="isPending"
            @delete-dataset="handleDeleteDataset"
          />
          <ListPagination
            v-if="!isPending && meta.totalCount > 0"
            v-model:page="page"
            v-model:limit="limit"
            :total-count="meta.totalCount"
            :single-page-detail="rowSumSuffix"
            noun="dataset.list.count"
          />
        </template>
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
