<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date';
import TaskPropertyButton from '~/features/task/components/TaskPropertyButton.vue';

// Models
const dueDate = defineModel<string | null>({ required: true });

// Refs
const isOpen = ref(false);

// Composables
const { t, locale } = useI18n();
const { formatDate } = useDateTimeFormat();

// Computed
// The calendar only understands calendar dates, so a full ISO timestamp is
// trimmed to its date part.
const isoDate = computed(() =>
  dueDate.value ? dueDate.value.slice(0, 10) : null,
);
const calendarValue = computed(() =>
  isoDate.value ? parseDate(isoDate.value) : undefined,
);

// Functions
function select(value: DateValue | undefined) {
  dueDate.value = value ? value.toString() : null;
  isOpen.value = false;
}

function remove() {
  dueDate.value = null;
  isOpen.value = false;
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <TaskPropertyButton
        :label="isoDate ? formatDate(isoDate) : t('task.property.dueDate')"
        :is-set="!!isoDate"
      >
        <template #leading>
          <Icon
            name="hugeicons:calendar-03"
            class="size-3.5 text-icon"
            aria-hidden="true"
          />
        </template>
      </TaskPropertyButton>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-70 p-3">
      <Calendar
        class="p-0"
        :model-value="calendarValue"
        :locale="locale"
        :week-starts-on="1"
        @update:model-value="select"
      />
      <Button
        v-if="isoDate"
        type="button"
        variant="ghost"
        size="sm"
        class="mt-2 w-full"
        @click="remove"
      >
        {{ t('task.property.removeDate') }}
      </Button>
    </PopoverContent>
  </Popover>
</template>
