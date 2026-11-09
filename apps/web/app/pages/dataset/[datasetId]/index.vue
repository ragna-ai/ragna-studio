<script setup lang="ts">
import DatasetDetail from '~/features/dataset/components/DatasetDetail.vue';
import {
  useExportDataset,
  useGetDataset,
  useGetDatasetRows,
  useUpdateDataset,
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
// The dataset name is renamed inline in the page header (InlineNameField).
const name = ref('');

// Composables
const { data: datasetData, error: datasetError } = useGetDataset(datasetId);
const { data: rowsData } = useGetDatasetRows(datasetId);
const { mutate: renameDataset } = useUpdateDataset();
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

// Keep the editable name synced to the loaded dataset, so a refetch after
// some other edit never shows stale text.
watch(
  () => datasetData.value?.dataset.name,
  (loadedName) => {
    name.value = loadedName ?? '';
  },
  { immediate: true },
);

// Computed
const crumbs = computed<PageCrumb[]>(() => [
  { label: t('dataset.list.title'), to: '/dataset' },
  { label: datasetName.value || t('dataset.detail.loading') },
]);

// Functions
// InlineNameField only emits `save` when the submitted name is non-empty
// and actually changed, so no extra guards are needed here.
function handleRename() {
  renameDataset({ datasetId: datasetId.value, name: name.value });
}

function handleExport(format: DatasetExportFormat) {
  exportDataset({ format });
}
</script>

<template>
  <PagePanel :crumbs="crumbs">
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between border-b px-4 py-2">
        <div class="min-w-0">
          <InlineNameField
            v-if="datasetData?.dataset"
            v-model:name="name"
            :label="t('dataset.detail.rename')"
            @save="handleRename"
          />
          <h1 v-else class="truncate text-sm font-semibold">
            {{ t('dataset.detail.loading') }}
          </h1>
        </div>
        <div class="flex shrink-0 items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="icon-sm"
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
            size="sm"
            :disabled="!datasetData?.dataset"
            leading-icon="hugeicons:table-columns-split"
            @click="isColumnManagerOpen = !isColumnManagerOpen"
          >
            {{ t('dataset.detail.manageColumns') }}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            :aria-label="t('dataset.detail.settings')"
            :disabled="!datasetData?.dataset"
            leading-icon="hugeicons:settings-01"
            @click="isSettingsOpen = !isSettingsOpen"
          />
        </div>
      </header>

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
