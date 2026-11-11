<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Calendar, type CalendarRootProps } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { parseDate, type DateValue } from '@internationalized/date';
import type { HTMLAttributes } from 'vue';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    placeholder?: string;
    clearLabel?: string;
    locale?: string;
    weekStartsOn?: CalendarRootProps['weekStartsOn'];
    disabled?: boolean;
    size?: 'sm' | 'default';
    class?: HTMLAttributes['class'];
    formatDate?: (isoDate: string) => string;
  }>(),
  {
    modelValue: null,
    placeholder: 'Pick a date',
    clearLabel: 'Clear date',
    locale: undefined,
    weekStartsOn: undefined,
    disabled: false,
    size: 'default',
    class: undefined,
    formatDate: undefined,
  },
);

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

const isOpen = ref(false);

// The calendar only understands calendar dates, so a full ISO timestamp is
// trimmed to its date part before being handed to it.
const isoDate = computed(() =>
  props.modelValue ? props.modelValue.slice(0, 10) : null,
);

const dateValue = computed<DateValue | undefined>(() =>
  isoDate.value ? parseDate(isoDate.value) : undefined,
);

const displayLabel = computed(() => {
  if (!isoDate.value) return null;
  return props.formatDate ? props.formatDate(isoDate.value) : isoDate.value;
});

function onSelect(value: DateValue | undefined) {
  emit('update:modelValue', value ? value.toString() : null);
  isOpen.value = false;
}

function clear() {
  emit('update:modelValue', null);
}
</script>

<template>
  <div :class="cn('flex items-center gap-1', props.class)">
    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <button
          type="button"
          data-slot="date-picker-trigger"
          :data-size="size"
          :disabled="disabled"
          class="flex min-w-0 shrink grow items-center gap-2 rounded-md border border-input bg-transparent pr-3 pl-2.5 text-body whitespace-nowrap shadow-xs outline-hidden transition-[color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-8 data-[size=sm]:h-7 dark:bg-input/30 dark:hover:bg-input/50"
        >
          <Icon
            name="hugeicons:calendar-03"
            class="size-4 shrink-0 text-icon"
          />
          <span v-if="displayLabel" class="truncate">{{ displayLabel }}</span>
          <span v-else class="truncate text-muted-foreground">{{
            placeholder
          }}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent class="w-70 p-3" align="start" :side-offset="8">
        <Calendar
          class="p-0"
          :model-value="dateValue"
          :locale="locale"
          :week-starts-on="weekStartsOn"
          @update:model-value="onSelect"
        />
      </PopoverContent>
    </Popover>
    <Button
      v-if="modelValue"
      type="button"
      variant="ghost"
      size="icon-sm"
      :aria-label="clearLabel"
      :title="clearLabel"
      @click="clear"
    >
      <Icon name="hugeicons:cancel-01" />
    </Button>
  </div>
</template>
