<script setup lang="ts">
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Maximize2Icon,
  PlusIcon,
  Trash2Icon,
} from '@lucide/vue';
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

// Functions
function cellValue(
  row: DatasetRow,
  column: DatasetColumn,
): string | number | null {
  return row.data[column.id] ?? null;
}

function commitText(row: DatasetRow, column: DatasetColumn, rawValue: string) {
  emit('update-cell', row.id, column.id, rawValue === '' ? null : rawValue);
}

function commitNumber(
  row: DatasetRow,
  column: DatasetColumn,
  rawValue: string,
) {
  emit(
    'update-cell',
    row.id,
    column.id,
    rawValue === '' ? null : Number(rawValue),
  );
}

function commitSelect(row: DatasetRow, column: DatasetColumn, value: unknown) {
  emit(
    'update-cell',
    row.id,
    column.id,
    value === undefined ? null : String(value),
  );
}

function inputValueOf(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}
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
        <TableRow v-for="(row, index) in rows" :key="row.id" class="group">
          <TableCell class="w-24">
            <div class="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                class="size-7"
                :class="{ 'bg-accent': row.id === expandedRowId }"
                :aria-label="t('dataset.grid.expandRow')"
                :aria-pressed="row.id === expandedRowId"
                @click="emit('expand-row', row.id)"
              >
                <Maximize2Icon
                  class="size-3.5 stroke-1.5"
                  :class="
                    row.id === expandedRowId
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  "
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 opacity-0 group-hover:opacity-100"
                :disabled="index === 0 || isMovingRow"
                :aria-label="t('dataset.grid.moveRowUp')"
                @click="emit('move-row-up', row.id)"
              >
                <ArrowUpIcon
                  class="size-3.5 stroke-1.5 text-muted-foreground"
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 opacity-0 group-hover:opacity-100"
                :disabled="index === rows.length - 1 || isMovingRow"
                :aria-label="t('dataset.grid.moveRowDown')"
                @click="emit('move-row-down', row.id)"
              >
                <ArrowDownIcon
                  class="size-3.5 stroke-1.5 text-muted-foreground"
                />
              </Button>
            </div>
          </TableCell>
          <TableCell v-for="column in columns" :key="column.id">
            <Select
              v-if="column.type === 'select'"
              :model-value="(cellValue(row, column) as string) ?? undefined"
              @update:model-value="(v) => commitSelect(row, column, v)"
            >
              <SelectTrigger class="h-8 w-full">
                <SelectValue
                  :placeholder="t('dataset.grid.selectPlaceholder')"
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in column.options ?? []"
                  :key="option"
                  :value="option"
                >
                  {{ option }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              v-else-if="column.type === 'number'"
              type="number"
              class="h-8"
              :model-value="(cellValue(row, column) as number) ?? ''"
              @blur="(e: Event) => commitNumber(row, column, inputValueOf(e))"
            />
            <Input
              v-else-if="column.type === 'date'"
              type="date"
              class="h-8"
              :model-value="(cellValue(row, column) as string) ?? ''"
              @blur="(e: Event) => commitText(row, column, inputValueOf(e))"
            />
            <!-- Text cells stay truncated to one line, but the full
                 value is hard to review/edit in that width. Click opens
                 a popover with a full-size textarea instead; closing it
                 (blur, outside click, Escape) commits the value, same
                 as every other cell type here. -->
            <Popover v-else>
              <PopoverTrigger as-child>
                <Button
                  type="button"
                  variant="outline"
                  class="h-9 w-full max-w-40 justify-start px-3 font-normal"
                  :aria-label="
                    t('dataset.grid.editCell', { column: column.name })
                  "
                >
                  <span class="min-w-0 truncate">{{
                    cellValue(row, column)
                  }}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-80 p-2" align="start">
                <Textarea
                  class="min-h-24"
                  :model-value="(cellValue(row, column) as string) ?? ''"
                  @blur="(e: Event) => commitText(row, column, inputValueOf(e))"
                />
              </PopoverContent>
            </Popover>
          </TableCell>
          <TableCell class="text-right">
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('dataset.grid.deleteRow')"
              @click="emit('delete-row', row.id)"
            >
              <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
            </Button>
          </TableCell>
        </TableRow>
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
