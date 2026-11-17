<script setup lang="ts">
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from '@lucide/vue';
import type {
  DatasetColumn,
  DatasetColumnType,
} from '~/features/dataset/types';

interface Props {
  columns: DatasetColumn[];
  isSaving?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSaving: false,
});

const emit = defineEmits<{
  (e: 'save', columns: DatasetColumn[]): void;
}>();

const open = defineModel<boolean>('open', { required: true });

// Composables
const { t } = useI18n();

// Refs
// A local draft, edited freely and only pushed back to the server on Save.
// Retyping a column (e.g. select -> text) leaves existing row values
// untouched; this panel only ever edits the schema.
const draft = ref<DatasetColumn[]>(cloneColumns());

const columnTypes: DatasetColumnType[] = ['text', 'number', 'date', 'select'];

// Functions
function addColumn() {
  draft.value.push({
    id: crypto.randomUUID(),
    name: '',
    type: 'text',
  });
}

function removeColumn(index: number) {
  draft.value.splice(index, 1);
}

function moveColumn(index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= draft.value.length) {
    return;
  }
  const [column] = draft.value.splice(index, 1);
  if (!column) {
    return;
  }
  draft.value.splice(targetIndex, 0, column);
}

function setColumnType(column: DatasetColumn, type: DatasetColumnType) {
  column.type = type;
  if (type !== 'select') {
    column.options = undefined;
  } else if (!column.options) {
    column.options = [];
  }
}

function optionsText(column: DatasetColumn): string {
  return column.options?.join(', ') ?? '';
}

function setOptionsFromText(column: DatasetColumn, text: string) {
  column.options = text
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

function cloneColumns(): DatasetColumn[] {
  return structuredClone(toRaw(props.columns));
}

function handleSave() {
  emit('save', draft.value);
}

// Hooks
// Every opening starts from the saved columns, so a cancelled edit never reappears.
watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }
  draft.value = cloneColumns();
});
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" class="gap-0 p-0">
      <SheetHeader>
        <SheetTitle>{{ t('dataset.columnManager.title') }}</SheetTitle>
        <SheetDescription class="sr-only">
          {{ t('dataset.columnManager.title') }}
        </SheetDescription>
      </SheetHeader>
      <div class="min-h-0 flex-1 overflow-y-auto p-6">
        <div class="flex flex-col gap-4">
          <div
            v-for="(column, index) in draft"
            :key="column.id"
            class="space-y-2 rounded-lg border p-3"
          >
            <div class="flex items-center justify-between gap-1">
              <Input
                v-model="column.name"
                :placeholder="t('dataset.columnManager.namePlaceholder')"
              />
              <div class="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  :disabled="index === 0"
                  :aria-label="t('dataset.columnManager.moveUp')"
                  @click="moveColumn(index, -1)"
                >
                  <ArrowUpIcon class="size-4 stroke-1.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  :disabled="index === draft.length - 1"
                  :aria-label="t('dataset.columnManager.moveDown')"
                  @click="moveColumn(index, 1)"
                >
                  <ArrowDownIcon class="size-4 stroke-1.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  :aria-label="t('dataset.columnManager.removeColumn')"
                  @click="removeColumn(index)"
                >
                  <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
                </Button>
              </div>
            </div>

            <Select
              :model-value="column.type"
              @update:model-value="
                (v) => setColumnType(column, v as DatasetColumnType)
              "
            >
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="type in columnTypes"
                  :key="type"
                  :value="type"
                >
                  {{ t(`dataset.columnManager.type.${type}`) }}
                </SelectItem>
              </SelectContent>
            </Select>

            <div v-if="column.type === 'select'">
              <Label class="mb-1 block text-xs text-muted-foreground">
                {{ t('dataset.columnManager.optionsLabel') }}
              </Label>
              <Input
                :model-value="optionsText(column)"
                :placeholder="t('dataset.columnManager.optionsPlaceholder')"
                @change="
                  (e: Event) =>
                    setOptionsFromText(
                      column,
                      (e.target as HTMLInputElement).value,
                    )
                "
              />
            </div>
          </div>

          <Button
            variant="outline"
            class="w-full"
            leading-icon="hugeicons:add-01"
            @click="addColumn"
          >
            {{ t('dataset.columnManager.addColumn') }}
          </Button>
        </div>
      </div>
      <SheetFooter class="justify-end">
        <Button variant="outline" @click="open = false">
          {{ t('common.cancel') }}
        </Button>
        <Button :disabled="isSaving" :loading="isSaving" @click="handleSave">
          {{ t('dataset.columnManager.save') }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
