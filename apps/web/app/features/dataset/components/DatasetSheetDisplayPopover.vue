<script setup lang="ts">
import { EyeIcon } from '@lucide/vue';
import type { DatasetSheetTable } from '~/features/dataset/composables/useDatasetSheet';
import { getSheetDataColumns } from '~/features/dataset/utils/datasetSheetDataColumns';

const props = defineProps<{ table: DatasetSheetTable }>();

const { t } = useI18n();

const dataColumns = computed(() => getSheetDataColumns(props.table));
const hiddenCount = computed(
  () =>
    dataColumns.value.filter(({ tableColumn }) => !tableColumn.getIsVisible())
      .length,
);
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="sm">
        <EyeIcon class="size-4 stroke-1.5 text-stone-500" />
        {{ t('dataset.sheet.toolbar.display') }}
        <Badge v-if="hiddenCount > 0" variant="secondary">
          {{ hiddenCount }}
        </Badge>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="flex w-64 flex-col gap-1 p-3">
      <p class="mb-1 text-xs text-stone-500">
        {{ t('dataset.sheet.display.title') }}
      </p>
      <label
        v-for="{ tableColumn, datasetColumn } in dataColumns"
        :key="datasetColumn.id"
        class="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-stone-100"
      >
        <span class="truncate">{{ datasetColumn.name }}</span>
        <Switch
          :model-value="tableColumn.getIsVisible()"
          @update:model-value="(value) => tableColumn.toggleVisibility(value)"
        />
      </label>
    </PopoverContent>
  </Popover>
</template>
