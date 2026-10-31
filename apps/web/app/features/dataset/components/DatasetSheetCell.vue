<script setup lang="ts">
import { CircleAlertIcon } from '@lucide/vue';
import type { CellSelectionDirection } from '@tanstack/vue-table';
import type { DatasetColumn } from '~/features/dataset/types';
import { formatNumber } from '~/features/dataset/utils/formatNumber';
import type { ParsedCellValue } from '~/features/dataset/utils/parseCellValue';

// Props
interface Props {
  column: DatasetColumn;
  value: ParsedCellValue;
  isEditing: boolean;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  /** A keyboard or pick commit. `null` means stay on the cell. */
  (e: 'commit', move: CellSelectionDirection | null): void;
  (e: 'cancel'): void;
  (e: 'blur'): void;
}>();

const draft = defineModel<string>('draft', { required: true });

// Refs
const editorRef = ref<{ $el: HTMLElement } | null>(null);

// Composables
const { t, locale } = useI18n();
const { formatDate } = useDateTimeFormat();

// Computed
const mismatchRaw = computed(() =>
  props.value.kind === 'mismatch' ? props.value.raw : '',
);

const displayText = computed(() => {
  if (props.value.kind !== 'valid') {
    return '';
  }
  if (props.column.type === 'date') {
    return formatDate(`${props.value.value}T00:00:00`);
  }
  if (typeof props.value.value === 'number') {
    return formatNumber(locale.value, props.value.value);
  }
  return String(props.value.value);
});

const isNumberColumn = computed(() => props.column.type === 'number');

// Functions
function handleEditorKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
    return;
  }
  const isTextNewline = event.key === 'Enter' && event.shiftKey;
  if (event.key === 'Enter' && !isTextNewline) {
    event.preventDefault();
    emit('commit', 'down');
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    emit('commit', event.shiftKey ? 'left' : 'right');
  }
}

function pickOption(option: unknown) {
  draft.value = typeof option === 'string' ? option : '';
  emit('commit', null);
}

function handleSelectOpenChange(isOpen: boolean) {
  if (!isOpen) {
    emit('cancel');
  }
}

function focusEditor() {
  const element = editorRef.value?.$el;
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (element.type === 'text' || element instanceof HTMLTextAreaElement) {
    element.setSelectionRange(element.value.length, element.value.length);
  }
}

// Hooks
watch(
  () => props.isEditing,
  (isEditing) => {
    if (isEditing) {
      nextTick(focusEditor);
    }
  },
  { immediate: true },
);
</script>

<template>
  <template v-if="isEditing">
    <Select
      v-if="column.type === 'select'"
      default-open
      :model-value="draft || undefined"
      @update:model-value="pickOption"
      @update:open="handleSelectOpenChange"
    >
      <SelectTrigger
        class="h-8 w-full border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      >
        <SelectValue :placeholder="mismatchRaw" />
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
      v-else-if="column.type === 'number' || column.type === 'date'"
      ref="editorRef"
      v-model="draft"
      :type="column.type"
      :placeholder="mismatchRaw"
      class="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      @keydown="handleEditorKeydown"
      @blur="emit('blur')"
    />
    <Textarea
      v-else
      ref="editorRef"
      v-model="draft"
      :placeholder="mismatchRaw"
      class="absolute top-0 left-0 z-40 min-h-9 w-80 max-w-[60vw] rounded-md border-0 bg-white shadow-none ring-1 ring-stone-400 focus-visible:ring-1 focus-visible:ring-stone-400"
      @keydown="handleEditorKeydown"
      @blur="emit('blur')"
    />
  </template>

  <span
    v-else-if="value.kind === 'mismatch'"
    class="flex min-w-0 items-center gap-1.5 text-stone-500"
  >
    <span class="truncate">{{ mismatchRaw }}</span>
    <Tooltip>
      <TooltipTrigger as-child>
        <CircleAlertIcon
          class="size-3.5 shrink-0 stroke-1.5 text-amber-500"
          :aria-label="t('dataset.sheet.mismatch')"
        />
      </TooltipTrigger>
      <TooltipContent>{{ t('dataset.sheet.mismatch') }}</TooltipContent>
    </Tooltip>
  </span>
  <span
    v-else-if="value.kind === 'valid' && column.type === 'select'"
    class="truncate rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
  >
    {{ displayText }}
  </span>
  <span
    v-else
    class="truncate"
    :class="{ 'w-full text-right tabular-nums': isNumberColumn }"
  >
    {{ displayText }}
  </span>
</template>
