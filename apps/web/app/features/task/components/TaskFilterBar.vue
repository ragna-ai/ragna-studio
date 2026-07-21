<script setup lang="ts">
import {
  isTaskPriority,
  isTaskStatus,
  PRIORITY_OPTIONS,
  STATUS_COLUMNS,
} from '~/features/task/lib/task-display';
import type { TaskLabel, TaskPriority, TaskStatus } from '~/features/task/types';

// shadcn's Select can't use an empty string as an item value (see
// AgentToolList's NO_DATASET), so "All" needs its own sentinel mapped back
// to `null` on change.
const ALL = '__all__';

// Props
const props = defineProps<{
  status: TaskStatus | null;
  priority: TaskPriority | null;
  taskLabelId: string | null;
  labels: TaskLabel[];
}>();

// Emits
const emit = defineEmits<{
  'update:status': [value: TaskStatus | null];
  'update:priority': [value: TaskPriority | null];
  'update:taskLabelId': [value: string | null];
}>();

// Composables
const { t } = useI18n();
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <Select
      :model-value="props.status ?? ALL"
      @update:model-value="(v) => emit('update:status', isTaskStatus(v) ? v : null)"
    >
      <SelectTrigger class="w-40" size="sm">
        <SelectValue :placeholder="t('task.filter.status')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL">{{ t('task.filter.allStatuses') }}</SelectItem>
        <SelectItem v-for="column in STATUS_COLUMNS" :key="column.value" :value="column.value">
          {{ t(column.labelKey) }}
        </SelectItem>
      </SelectContent>
    </Select>

    <Select
      :model-value="props.priority ?? ALL"
      @update:model-value="(v) => emit('update:priority', isTaskPriority(v) ? v : null)"
    >
      <SelectTrigger class="w-40" size="sm">
        <SelectValue :placeholder="t('task.filter.priority')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL">{{ t('task.filter.allPriorities') }}</SelectItem>
        <SelectItem v-for="option in PRIORITY_OPTIONS" :key="option.value" :value="option.value">
          {{ t(option.labelKey) }}
        </SelectItem>
      </SelectContent>
    </Select>

    <Select
      :model-value="props.taskLabelId ?? ALL"
      @update:model-value="(v) => emit('update:taskLabelId', v === ALL ? null : String(v))"
    >
      <SelectTrigger class="w-40" size="sm">
        <SelectValue :placeholder="t('task.filter.label')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL">{{ t('task.filter.allLabels') }}</SelectItem>
        <SelectItem v-for="label in props.labels" :key="label.id" :value="label.id">
          {{ label.name }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
