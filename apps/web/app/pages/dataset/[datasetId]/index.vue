<script setup lang="ts">
import DatasetDetail from '~/features/dataset/components/DatasetDetail.vue';
import {
  useExportDataset,
  useGetDataset,
  useGetDatasetRows,
} from '~/features/dataset/composables/useDatasetApi';
import type { DatasetExportFormat } from '~/features/dataset/types';

definePageMeta({
  validate: (route) => hasValidDatasetId(route.params),
});

const route = useRoute();
const datasetId = computed(() => route.params.datasetId as string);

// Refs
const isColumnManagerOpen = ref(false);
const isSettingsOpen = ref(false);

// Composables
const { data: datasetData, error: datasetError } = useGetDataset(datasetId);
const { data: rowsData } = useGetDatasetRows(datasetId);
const datasetName = computed(() => datasetData.value?.dataset.name ?? '');
const { mutate: exportDataset, isPending: isExporting } = useExportDataset(
  datasetId,
  datasetName,
);
const { t } = useI18n();

useHead({
  title: computed(
    () => datasetData.value?.dataset.name ?? t('dataset.detail.title'),
  ),
});

// Computed
const crumbs = computed<PageCrumb[]>(() => [
  { label: t('dataset.list.title'), to: '/dataset' },
  { label: datasetName.value || t('dataset.detail.loading') },
]);

// Functions
function handleExport(format: DatasetExportFormat) {
  exportDataset({ format });
}
</script>

<template>
  <PagePanel :crumbs="crumbs" fill>
    <div class="flex h-full flex-col">
      <Heading>
        <template #top>
          <HeadingTitle
            :title="datasetName || t('dataset.detail.loading')"
            :subtitle="datasetData?.dataset.description ?? undefined"
          >
            <template #button>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="outline"
                    size="icon"
                    :disabled="!datasetData?.dataset || isExporting"
                    :aria-label="t('dataset.detail.export.button')"
                    :loading="isExporting"
                    leading-icon="hugeicons:download-01"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @click="handleExport('csv')">
                    {{ t('dataset.detail.export.csv') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="handleExport('xlsx')">
                    {{ t('dataset.detail.export.excel') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="handleExport('pdf')">
                    {{ t('dataset.detail.export.pdf') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="handleExport('md')">
                    {{ t('dataset.detail.export.markdown') }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="icon"
                :aria-label="t('dataset.detail.settings')"
                :disabled="!datasetData?.dataset"
                leading-icon="hugeicons:settings-01"
                @click="isSettingsOpen = true"
              />
              <Button
                variant="outline"
                :disabled="!datasetData?.dataset"
                leading-icon="hugeicons:table-columns-split"
                @click="isColumnManagerOpen = true"
              >
                {{ t('dataset.detail.manageColumns') }}
              </Button>
            </template>
          </HeadingTitle>
        </template>
      </Heading>

      <DatasetDetail
        v-if="datasetData?.dataset"
        :key="datasetData.dataset.id"
        v-model:column-manager-open="isColumnManagerOpen"
        v-model:settings-open="isSettingsOpen"
        :dataset="datasetData.dataset"
        :rows="rowsData?.rows ?? []"
      />
      <div
        v-else-if="datasetError"
        class="flex min-h-0 flex-1 items-center justify-center"
      >
        <p class="text-sm text-stone-500">
          {{ datasetError.message || t('dataset.detail.loadError') }}
        </p>
      </div>
    </div>
  </PagePanel>
</template>
