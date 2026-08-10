<script setup lang="ts">
import { Trash2Icon } from '@lucide/vue';
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

// The panel is only ever mounted while a row is selected (parent uses
// v-else-if), so it's always open; closing it (X button, Escape, outside
// click) just tells the parent to unmount it.
function handleOpenChange(isOpen: boolean) {
  if (!isOpen) {
    emit('close');
  }
}
</script>

<template>
  <Dialog :open="true" @update:open="handleOpenChange">
    <DialogContent class="flex max-h-[85vh] flex-col sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('dataset.rowPanel.title') }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4 overflow-y-auto">
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
          <!-- Overrides the base Textarea's `field-sizing-content` (see
               components/ui/textarea/Textarea.vue), which grows with
               content but disables manual resizing: two rows by default,
               user-resizable from there. -->
          <Textarea
            v-else
            rows="2"
            class="field-sizing-fixed min-h-0 resize-y"
            :model-value="(cellValue(column) as string) ?? ''"
            @blur="(e: Event) => commitText(column, inputValueOf(e))"
          />
        </div>
      </div>

      <Separator />

      <div class="space-y-1 text-xs text-muted-foreground">
        <p>{{ t('common.created') }}: {{ formatDateTime(row.createdAt) }}</p>
        <p>{{ t('common.updated') }}: {{ formatDateTime(row.updatedAt) }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" class="text-destructive" @click="emit('delete', row.id)">
          <Trash2Icon class="mr-2 size-4 stroke-1.5" />
          {{ t('dataset.grid.deleteRow') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
