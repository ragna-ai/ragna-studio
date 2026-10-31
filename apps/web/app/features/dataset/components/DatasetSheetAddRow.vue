<script setup lang="ts">
import { PlusIcon } from '@lucide/vue';
import { ROW_NUMBER_COLUMN_ID } from '~/features/dataset/utils/datasetSheetColumns';
import {
  columnStyle,
  pinnedClass,
  type SheetColumn,
} from '~/features/dataset/utils/datasetSheetLayout';
import { cn } from '~/lib/utils';

// Props
interface Props {
  columns: SheetColumn[];
  isAddingRow: boolean;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  /** `columnId` is the clicked data column, unset for the row number and the rest of the row. */
  (e: 'add', columnId?: string): void;
}>();

// Composables
const { t } = useI18n();

// Functions
function handleAdd(columnId?: string) {
  if (!props.isAddingRow) {
    emit('add', columnId);
  }
}

function dataColumnIdOf(column: SheetColumn) {
  return column.id === ROW_NUMBER_COLUMN_ID ? undefined : column.id;
}
</script>

<template>
  <div
    class="group flex h-9 flex-none cursor-pointer border-b border-stone-200 hover:bg-stone-100"
    @click="handleAdd()"
  >
    <div
      v-for="column in columns"
      :key="column.id"
      :class="
        cn(
          'flex flex-none items-center justify-center border-r border-stone-200 bg-stone-50 group-hover:bg-stone-100',
          pinnedClass(column),
        )
      "
      :style="columnStyle(column)"
      @click.stop="handleAdd(dataColumnIdOf(column))"
    >
      <Button
        v-if="column.id === ROW_NUMBER_COLUMN_ID"
        variant="ghost"
        size="icon"
        class="size-6"
        :disabled="isAddingRow"
        :aria-label="t('dataset.sheet.addRow')"
      >
        <PlusIcon
          class="size-4 stroke-1.5 text-stone-500 group-hover:text-stone-700"
        />
      </Button>
    </div>
    <div class="w-11 flex-none bg-stone-50 group-hover:bg-stone-100" />
  </div>
</template>
