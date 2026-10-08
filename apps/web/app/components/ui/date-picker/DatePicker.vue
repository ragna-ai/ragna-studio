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
import { CalendarIcon, XIcon } from '@lucide/vue';
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
        <Button
          type="button"
          variant="outline"
          class="min-w-0 shrink grow justify-start font-normal"
          :disabled="disabled"
        >
          <CalendarIcon class="mr-2 size-4 shrink-0 stroke-1.5" />
          <span v-if="displayLabel" class="truncate">{{ displayLabel }}</span>
          <span v-else class="truncate text-muted-foreground">{{
            placeholder
          }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0" align="start">
        <Calendar
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
      size="icon"
      :aria-label="clearLabel"
      :title="clearLabel"
      @click="clear"
    >
      <XIcon class="size-4" />
    </Button>
  </div>
</template>
