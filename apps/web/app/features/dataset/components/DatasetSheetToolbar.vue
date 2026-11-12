<script setup lang="ts">
import DatasetSheetDisplayPopover from '~/features/dataset/components/DatasetSheetDisplayPopover.vue';
import DatasetSheetFilterPopover from '~/features/dataset/components/DatasetSheetFilterPopover.vue';
import DatasetSheetSortPopover from '~/features/dataset/components/DatasetSheetSortPopover.vue';
import type { DatasetSheetTable } from '~/features/dataset/composables/useDatasetSheet';

interface DatasetSheetToolbarProps {
  table: DatasetSheetTable;
  rowCount: number;
}

defineProps<DatasetSheetToolbarProps>();

const { t } = useI18n();

// Placeholder until the API can search rows.
const searchText = ref('');
</script>

<template>
  <div class="flex h-11 items-center justify-between gap-2 px-3">
    <ListSearch
      v-model="searchText"
      :placeholder="t('dataset.sheet.search', { count: rowCount })"
    />
    <div class="flex shrink-0 items-center gap-1 text-sm">
      <DatasetSheetFilterPopover :table="table" />
      <DatasetSheetSortPopover :table="table" />
      <DatasetSheetDisplayPopover :table="table" />
    </div>
  </div>
</template>
