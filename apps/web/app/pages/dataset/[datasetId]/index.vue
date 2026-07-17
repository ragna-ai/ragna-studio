<script setup lang="ts">
import { Columns3Icon, SettingsIcon } from '@lucide/vue';
import DatasetDetail from '~/features/dataset/components/DatasetDetail.vue';
import {
  useGetDataset,
  useGetDatasetRows,
  useUpdateDataset,
} from '~/features/dataset/composables/useDatasetApi';

definePageMeta({
  validate: (route) => hasValidDatasetId(route.params),
});

const route = useRoute();
const datasetId = computed(() => route.params.datasetId as string);

// Refs
// Owned here, not inside DatasetDetail: the "Columns" and settings buttons
// live in this page's header, which renders even before the dataset has
// loaded.
const isColumnManagerOpen = ref(false);
const isSettingsOpen = ref(false);
// The dataset name is renamed inline in the breadcrumb's current item
// (InlineNameField), same pattern as the workflow editor.
const name = ref('');

// Composables
const { data: datasetData, error: datasetError } = useGetDataset(datasetId);
const { data: rowsData } = useGetDatasetRows(datasetId);
const { mutate: renameDataset } = useUpdateDataset();
const { t } = useI18n();

useHead({
  title: computed(() => datasetData.value?.dataset.name ?? t('dataset.detail.title')),
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
// The breadcrumb replaces the page title in-place, so it has to render
// immediately, before the dataset name is known. While loading, a static
// trail with the "loading" copy stands in for the editable current item.
const ancestorItems = computed(() => [{ label: t('dataset.list.title'), to: '/dataset' }]);
const loadingItems = computed(() => [
  ...ancestorItems.value,
  { label: t('dataset.detail.loading') },
]);

// Functions
// InlineNameField only emits `save` when the submitted name is non-empty
// and actually changed, so no extra guards are needed here.
function handleRename() {
  renameDataset({ datasetId: datasetId.value, name: name.value });
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-center justify-between border-b px-4 py-2">
      <div class="min-w-0">
        <PageBreadcrumb v-if="datasetData?.dataset" :items="ancestorItems">
          <template #current>
            <InlineNameField
              v-model:name="name"
              :aria-label="t('dataset.detail.rename')"
              @save="handleRename"
            />
          </template>
        </PageBreadcrumb>
        <PageBreadcrumb v-else :items="loadingItems" />
        <p v-if="datasetData?.dataset" class="text-xs text-muted-foreground">
          {{ t(`dataset.origin.${datasetData.dataset.origin}`) }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="!datasetData?.dataset"
          @click="isColumnManagerOpen = !isColumnManagerOpen"
        >
          <Columns3Icon class="mr-2 size-4 stroke-1.5" />
          {{ t('dataset.detail.manageColumns') }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          :aria-label="t('dataset.detail.settings')"
          :disabled="!datasetData?.dataset"
          @click="isSettingsOpen = !isSettingsOpen"
        >
          <SettingsIcon class="size-4 stroke-1.5" />
        </Button>
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
    <div v-else-if="datasetError" class="flex min-h-0 flex-1 items-center justify-center">
      <p class="text-sm text-stone-500">
        {{ datasetError.message || t('dataset.detail.loadError') }}
      </p>
    </div>
    <div v-else class="flex min-h-0 flex-1 items-center justify-center">
      <p class="text-sm text-stone-500">{{ t('dataset.detail.loading') }}</p>
    </div>
  </div>
</template>
