<script setup lang="ts">
import { Table2Icon } from '@lucide/vue';
import DatasetSheetDisplayPopover from '~/features/dataset/components/DatasetSheetDisplayPopover.vue';
import DatasetSheetFilterPopover from '~/features/dataset/components/DatasetSheetFilterPopover.vue';
import DatasetSheetSortPopover from '~/features/dataset/components/DatasetSheetSortPopover.vue';
import type { DatasetSheetTable } from '~/features/dataset/composables/useDatasetSheet';

defineProps<{
  table: DatasetSheetTable;
  title: string;
}>();
</script>

<template>
  <div class="flex h-11 items-center justify-between gap-2 px-3">
    <div class="flex min-w-0 items-center gap-2">
      <Table2Icon class="size-4 shrink-0 stroke-1.5 text-stone-500" />
      <span class="truncate text-sm font-medium text-stone-900">{{
        title
      }}</span>
    </div>
    <div class="flex shrink-0 items-center gap-1 text-sm">
      <DatasetSheetFilterPopover :table="table" />
      <DatasetSheetSortPopover :table="table" />
      <DatasetSheetDisplayPopover :table="table" />
    </div>
  </div>
</template>
