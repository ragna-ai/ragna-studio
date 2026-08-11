<script setup lang="ts">
import { PlusIcon } from '@lucide/vue';
import DatasetGridRow from '~/features/dataset/components/DatasetGridRow.vue';
import type { DatasetColumn, DatasetRow } from '~/features/dataset/types';

interface Props {
  columns: DatasetColumn[];
  rows: DatasetRow[];
  isAddingRow?: boolean;
  // Row whose panel is currently open; its expand button renders active
  // (the button is a toggle).
  expandedRowId?: string | null;
  // No optimistic reordering (PRD decision 7): while a move request is in
  // flight, every up/down button is disabled rather than just one row's.
  isMovingRow?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isAddingRow: false,
  expandedRowId: null,
  isMovingRow: false,
});

const emit = defineEmits<{
  (
    e: 'update-cell',
    rowId: string,
    columnId: string,
    value: string | number | null,
  ): void;
  (e: 'add-row'): void;
  (e: 'delete-row', rowId: string): void;
  // Opens DatasetRowPanel for this row. A dedicated leading-cell button,
  // not a row click, so it doesn't fight with clicking into a cell to edit it.
  (e: 'expand-row', rowId: string): void;
  (e: 'move-row-up', rowId: string): void;
  (e: 'move-row-down', rowId: string): void;
}>();

// Composables
const { t } = useI18n();

// Computed
// +1 for the leading expand cell, +1 for actions. Timestamps live in
// DatasetRowPanel, not the grid.
const columnCount = computed(() => props.columns.length + 2);
</script>

<template>
  <div class="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>&nbsp;</TableHead>
          <TableHead
            v-for="column in columns"
            :key="column.id"
            class="min-w-40"
          >
            {{ column.name }}
          </TableHead>
          <TableHead class="text-right">{{ t('common.actions') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="rows.length === 0" :colspan="columnCount">
          {{ t('dataset.grid.empty') }}
        </TableEmpty>
        <DatasetGridRow
          v-for="(row, index) in rows"
          :key="row.id"
          :row="row"
          :columns="columns"
          :is-first="index === 0"
          :is-last="index === rows.length - 1"
          :is-expanded="row.id === expandedRowId"
          :is-moving-row="isMovingRow"
          @update-cell="
            (columnId, value) => emit('update-cell', row.id, columnId, value)
          "
          @delete-row="emit('delete-row', row.id)"
          @expand-row="emit('expand-row', row.id)"
          @move-row-up="emit('move-row-up', row.id)"
          @move-row-down="emit('move-row-down', row.id)"
        />
      </TableBody>
    </Table>
    <div class="mt-4">
      <Button
        variant="outline"
        :disabled="isAddingRow"
        @click="emit('add-row')"
      >
        <Spinner v-if="isAddingRow" class="mr-2" />
        <PlusIcon v-else class="mr-2 size-4" />
        {{ t('dataset.grid.addRow') }}
      </Button>
    </div>
  </div>
</template>
