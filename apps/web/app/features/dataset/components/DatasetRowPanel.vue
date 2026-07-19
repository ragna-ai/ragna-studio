<script setup lang="ts">
import { Trash2Icon, XIcon } from '@lucide/vue';
import type { DatasetColumn, DatasetRow } from '~/features/dataset/types';

interface Props {
  columns: DatasetColumn[];
  row: DatasetRow;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update-cell', rowId: string, columnId: string, value: string | number | null): void;
  (e: 'delete', rowId: string): void;
  (e: 'close'): void;
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Functions
function cellValue(column: DatasetColumn): string | number | null {
  return props.row.data[column.id] ?? null;
}

function commitText(column: DatasetColumn, rawValue: string) {
  emit('update-cell', props.row.id, column.id, rawValue === '' ? null : rawValue);
}

function commitNumber(column: DatasetColumn, rawValue: string) {
  emit('update-cell', props.row.id, column.id, rawValue === '' ? null : Number(rawValue));
}

function commitSelect(column: DatasetColumn, value: unknown) {
  emit('update-cell', props.row.id, column.id, value === undefined ? null : String(value));
}

function inputValueOf(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}
</script>

<template>
  <aside class="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-card p-4">
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold">{{ t('dataset.rowPanel.title') }}</p>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('dataset.rowPanel.close')"
        @click="emit('close')"
      >
        <XIcon class="size-4 stroke-1.5" />
      </Button>
    </div>

    <div class="flex flex-col gap-4">
      <div v-for="column in columns" :key="column.id" class="space-y-1">
        <Label class="text-xs text-muted-foreground">{{ column.name }}</Label>
        <Select
          v-if="column.type === 'select'"
          :model-value="(cellValue(column) as string) ?? undefined"
          @update:model-value="(v) => commitSelect(column, v)"
        >
          <SelectTrigger class="w-full">
            <SelectValue :placeholder="t('dataset.grid.selectPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in column.options ?? []" :key="option" :value="option">
              {{ option }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-else-if="column.type === 'number'"
          type="number"
          :model-value="(cellValue(column) as number) ?? ''"
          @blur="(e: Event) => commitNumber(column, inputValueOf(e))"
        />
        <Input
          v-else-if="column.type === 'date'"
          type="date"
          :model-value="(cellValue(column) as string) ?? ''"
          @blur="(e: Event) => commitText(column, inputValueOf(e))"
        />
        <!-- `field-sizing-content` on the base Textarea (see
             components/ui/textarea/Textarea.vue) grows it with its
             content, so long text doesn't need a fixed row count here. -->
        <Textarea
          v-else
          class="min-h-24"
          :model-value="(cellValue(column) as string) ?? ''"
          @blur="(e: Event) => commitText(column, inputValueOf(e))"
        />
      </div>
    </div>

    <Separator />

    <div class="space-y-1 text-xs text-muted-foreground">
      <p>{{ t('dataset.grid.created') }}: {{ formatDateTime(row.createdAt) }}</p>
      <p>{{ t('dataset.grid.updated') }}: {{ formatDateTime(row.updatedAt) }}</p>
    </div>

    <Button variant="outline" class="text-destructive" @click="emit('delete', row.id)">
      <Trash2Icon class="mr-2 size-4 stroke-1.5" />
      {{ t('dataset.grid.deleteRow') }}
    </Button>
  </aside>
</template>
