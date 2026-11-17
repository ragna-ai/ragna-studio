<script setup lang="ts">
// Imports
import { parseDate, type DateValue } from '@internationalized/date';
import { ISO_DATE_PATTERN } from '~/features/dataset/utils/parseCellValue';

// Emits
const emit = defineEmits<{
  (e: 'commit'): void;
  (e: 'cancel'): void;
}>();

const draft = defineModel<string>('draft', { required: true });

// Composables
const { locale } = useI18n();
const { formatDate } = useDateTimeFormat();

// Computed
const calendarValue = computed(() => toCalendarDate(draft.value));

const displayText = computed(() =>
  calendarValue.value ? formatDate(`${draft.value}T00:00:00`) : draft.value,
);

// Functions
/** A draft that isn't a real calendar day (typed text, 2026-02-31) opens the calendar on today. */
function toCalendarDate(text: string): DateValue | undefined {
  if (!ISO_DATE_PATTERN.test(text)) {
    return undefined;
  }
  try {
    return parseDate(text);
  } catch {
    return undefined;
  }
}

function pickDate(value: DateValue | undefined) {
  draft.value = value ? value.toString() : '';
  emit('commit');
}

function handleOpenChange(isOpen: boolean) {
  if (!isOpen) {
    emit('cancel');
  }
}
</script>

<template>
  <Popover default-open @update:open="handleOpenChange">
    <PopoverAnchor class="absolute inset-0" />
    <span class="truncate">{{ displayText }}</span>
    <PopoverContent class="w-70 p-3" align="start" :side-offset="6">
      <Calendar
        class="p-0"
        :model-value="calendarValue"
        :default-placeholder="calendarValue"
        :locale="locale"
        :week-starts-on="1"
        @update:model-value="pickDate"
      />
    </PopoverContent>
  </Popover>
</template>
