<script setup lang="ts">
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Maximize2Icon,
  PlugIcon,
  Trash2Icon,
} from '@lucide/vue';
import DatasetGridSelectCell from '~/features/dataset/components/DatasetGridSelectCell.vue';
import type { DatasetColumn, DatasetRow } from '~/features/dataset/types';

// Imports

// Props
interface Props {
  row: DatasetRow;
  columns: DatasetColumn[];
  isFirst: boolean;
  isLast: boolean;
  // Whether this row's panel is currently open; the expand button renders
  // active (the button is a toggle). Split out of DatasetGrid so toggling
  // it only re-renders the two affected rows, not the whole grid.
  isExpanded: boolean;
  isMovingRow?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isMovingRow: false,
});

// Emits
const emit = defineEmits<{
  (e: 'update-cell', columnId: string, value: string | number | null): void;
  (e: 'delete-row'): void;
  (e: 'expand-row'): void;
  (e: 'move-row-up'): void;
  (e: 'move-row-down'): void;
}>();

// Composables
const { t } = useI18n();

// Functions
function cellValue(column: DatasetColumn): string | number | null {
  return props.row.data[column.id] ?? null;
}

function commitText(column: DatasetColumn, rawValue: string) {
  emit('update-cell', column.id, rawValue === '' ? null : rawValue);
}

function commitNumber(column: DatasetColumn, rawValue: string) {
  emit('update-cell', column.id, rawValue === '' ? null : Number(rawValue));
}

function inputValueOf(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}
</script>

<template>
  <TableRow class="group">
    <TableCell class="w-24">
      <div class="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          class="size-7"
          :class="{ 'bg-accent': isExpanded }"
          :aria-label="t('dataset.grid.expandRow')"
          :aria-pressed="isExpanded"
          @click="emit('expand-row')"
        >
          <Maximize2Icon
            class="size-3.5 stroke-1.5"
            :class="isExpanded ? 'text-foreground' : 'text-muted-foreground'"
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 opacity-0 group-hover:opacity-100"
          :disabled="isFirst || isMovingRow"
          :aria-label="t('dataset.grid.moveRowUp')"
          @click="emit('move-row-up')"
        >
          <ArrowUpIcon class="size-3.5 stroke-1.5 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 opacity-0 group-hover:opacity-100"
          :disabled="isLast || isMovingRow"
          :aria-label="t('dataset.grid.moveRowDown')"
          @click="emit('move-row-down')"
        >
          <ArrowDownIcon class="size-3.5 stroke-1.5 text-muted-foreground" />
        </Button>
        <TooltipProvider v-if="row.writtenBy === 'mcp'">
          <Tooltip>
            <TooltipTrigger as-child>
              <Badge variant="outline" class="ml-1 gap-1 px-1.5 py-0">
                <PlugIcon class="size-3 stroke-1.5" />
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{{ t('dataset.grid.writtenByMcp') }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </TableCell>
    <TableCell v-for="column in columns" :key="column.id">
      <DatasetGridSelectCell
        v-if="column.type === 'select'"
        :value="cellValue(column) as string | null"
        :options="column.options ?? []"
        :column-name="column.name"
        @update:value="(value) => emit('update-cell', column.id, value)"
      />
      <Input
        v-else-if="column.type === 'number'"
        type="number"
        class="h-9"
        :model-value="(cellValue(column) as number) ?? ''"
        @blur="(e: Event) => commitNumber(column, inputValueOf(e))"
      />
      <Input
        v-else-if="column.type === 'date'"
        type="date"
        class="h-9"
        :model-value="(cellValue(column) as string) ?? ''"
        @blur="(e: Event) => commitText(column, inputValueOf(e))"
      />
      <!-- Text cells stay truncated to one line, but the full value is hard
           to review/edit in that width. Click opens a popover with a
           full-size textarea instead; closing it (blur, outside click,
           Escape) commits the value, same as every other cell type here. -->
      <Popover v-else>
        <PopoverTrigger as-child>
          <Button
            type="button"
            variant="outline"
            class="h-9 w-full max-w-40 justify-start px-3 font-normal"
            :aria-label="t('dataset.grid.editCell', { column: column.name })"
          >
            <span class="min-w-0 truncate">{{ cellValue(column) }}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-80 p-2" align="start">
          <Textarea
            class="min-h-24"
            :model-value="(cellValue(column) as string) ?? ''"
            @blur="(e: Event) => commitText(column, inputValueOf(e))"
          />
        </PopoverContent>
      </Popover>
    </TableCell>
    <TableCell class="text-right">
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('dataset.grid.deleteRow')"
        @click="emit('delete-row')"
      >
        <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
      </Button>
    </TableCell>
  </TableRow>
</template>
