<script setup lang="ts">
import { ArrowDownUpIcon } from '@lucide/vue';
import type { DatasetSheetTable } from '~/features/dataset/composables/useDatasetSheet';
import { getSheetDataColumns } from '~/features/dataset/utils/datasetSheetDataColumns';

// Props
const props = defineProps<{ table: DatasetSheetTable }>();

const { t } = useI18n();

// Computed
const dataColumns = computed(() => getSheetDataColumns(props.table));
const activeSort = computed(() => props.table.atoms.sorting.get()[0]);
const sortCount = computed(() => props.table.atoms.sorting.get().length);

// Functions
function sortBy(columnId: string, desc: boolean) {
  props.table.setSorting([{ id: columnId, desc }]);
}

function selectColumn(columnId: string) {
  sortBy(columnId, activeSort.value?.desc ?? false);
}

function selectDirection(direction: string) {
  const sort = activeSort.value;
  if (!sort) {
    return;
  }
  sortBy(sort.id, direction === 'desc');
}

function clearSort() {
  props.table.setSorting([]);
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="sm">
        <ArrowDownUpIcon class="size-4 stroke-1.5 text-stone-500" />
        {{ t('dataset.sheet.toolbar.sort') }}
        <Badge v-if="sortCount > 0" variant="secondary">
          {{ sortCount }}
        </Badge>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="flex w-72 flex-col gap-2 p-3">
      <Select
        :model-value="activeSort?.id"
        @update:model-value="(value) => selectColumn(String(value))"
      >
        <SelectTrigger class="h-8 w-full">
          <SelectValue :placeholder="t('dataset.sheet.sort.column')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="{ datasetColumn } in dataColumns"
            :key="datasetColumn.id"
            :value="datasetColumn.id"
          >
            {{ datasetColumn.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select
        :model-value="activeSort?.desc ? 'desc' : 'asc'"
        :disabled="!activeSort"
        @update:model-value="(value) => selectDirection(String(value))"
      >
        <SelectTrigger class="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="asc">
            {{ t('dataset.sheet.sort.ascending') }}
          </SelectItem>
          <SelectItem value="desc">
            {{ t('dataset.sheet.sort.descending') }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        class="self-start"
        :disabled="!activeSort"
        @click="clearSort"
      >
        {{ t('dataset.sheet.sort.clear') }}
      </Button>
    </PopoverContent>
  </Popover>
</template>
