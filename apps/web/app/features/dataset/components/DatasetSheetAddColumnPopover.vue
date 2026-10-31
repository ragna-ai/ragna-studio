<script setup lang="ts">
import { PlusIcon } from '@lucide/vue';
import type { DatasetColumnType } from '~/features/dataset/types';

/** What the user entered. `options` is set for select columns only. */
export interface NewColumnInput {
  name: string;
  type: DatasetColumnType;
  options?: string[];
}

const props = defineProps<{
  disabled: boolean;
  limit: number;
}>();

const emit = defineEmits<{
  (e: 'add', column: NewColumnInput): void;
}>();

const { t } = useI18n();

const columnTypes: DatasetColumnType[] = ['text', 'number', 'date', 'select'];

// Refs
const isOpen = ref(false);
const name = ref('');
const type = ref<DatasetColumnType>('text');
const optionsText = ref('');
const showNameError = ref(false);

// Computed
const isNameMissing = computed(() => name.value.trim().length === 0);

// Functions
function parseOptions(text: string): string[] {
  return text
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

function resetForm() {
  name.value = '';
  type.value = 'text';
  optionsText.value = '';
  showNameError.value = false;
}

function setType(value: string) {
  const selected = columnTypes.find((columnType) => columnType === value);
  if (selected) {
    type.value = selected;
  }
}

function handleSubmit() {
  if (isNameMissing.value) {
    showNameError.value = true;
    return;
  }
  emit('add', {
    name: name.value.trim(),
    type: type.value,
    options:
      type.value === 'select' ? parseOptions(optionsText.value) : undefined,
  });
  isOpen.value = false;
}

function handleOpenChange(open: boolean) {
  if (!open) {
    resetForm();
  }
}
</script>

<template>
  <Tooltip v-if="props.disabled">
    <TooltipTrigger as-child>
      <span class="inline-flex" tabindex="0">
        <Button
          variant="ghost"
          size="icon"
          class="size-7"
          disabled
          :aria-label="t('dataset.sheet.addColumn.label')"
        >
          <PlusIcon class="size-4 stroke-1.5 text-stone-500" />
        </Button>
      </span>
    </TooltipTrigger>
    <TooltipContent>
      {{ t('dataset.sheet.addColumn.limit', { max: props.limit }) }}
    </TooltipContent>
  </Tooltip>
  <Popover v-else v-model:open="isOpen" @update:open="handleOpenChange">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="group/addcol size-7"
        :aria-label="t('dataset.sheet.addColumn.label')"
      >
        <PlusIcon
          class="size-4 stroke-1.5 text-stone-500 group-hover/addcol:text-stone-700"
        />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-72 p-3">
      <form class="flex flex-col gap-2" @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1">
          <Input
            v-model="name"
            class="h-8"
            :placeholder="t('dataset.columnManager.namePlaceholder')"
            :aria-invalid="showNameError && isNameMissing"
            @update:model-value="showNameError = false"
          />
          <p v-if="showNameError" class="text-xs text-destructive">
            {{ t('dataset.sheet.addColumn.nameRequired') }}
          </p>
        </div>
        <Select
          :model-value="type"
          @update:model-value="(v) => setType(String(v))"
        >
          <SelectTrigger class="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="columnType in columnTypes"
              :key="columnType"
              :value="columnType"
            >
              {{ t(`dataset.columnManager.type.${columnType}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-if="type === 'select'"
          v-model="optionsText"
          class="h-8"
          :placeholder="t('dataset.columnManager.optionsPlaceholder')"
        />
        <Button type="submit" size="sm" class="self-end">
          {{ t('dataset.sheet.addColumn.submit') }}
        </Button>
      </form>
    </PopoverContent>
  </Popover>
</template>
