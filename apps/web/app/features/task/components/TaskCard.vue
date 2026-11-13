<script setup lang="ts">
import { CalendarIcon, UserIcon } from '@lucide/vue';
import {
  formatTaskDisplayId,
  isTaskOverdue,
  priorityOption,
} from '~/features/task/lib/task-display';
import { labelTone } from '~/features/task/lib/label-tone';
import { cn } from '~/lib/utils';
import type { TaskWithBoardInfo } from '~/features/task/types';

// Props
const props = defineProps<{ task: TaskWithBoardInfo }>();

// Composables
const { t } = useI18n();
const { formatDate } = useDateTimeFormat();

// Computed
const displayId = computed(() => formatTaskDisplayId(props.task.number));
const overdue = computed(() => isTaskOverdue(props.task));
const priority = computed(() => priorityOption(props.task.priority));
const dueDateLabel = computed(() =>
  props.task.dueDate ? formatDate(props.task.dueDate) : null,
);
</script>

<template>
  <NuxtLinkLocale
    :to="`/tasks/${task.id}`"
    class="block cursor-pointer rounded-lg border bg-card p-3 shadow-xs transition-colors hover:bg-stone-50"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-medium text-muted-foreground">{{
        displayId
      }}</span>
      <Icon
        :name="priority.icon"
        :class="cn('size-3.5 shrink-0', priority.iconClass)"
        role="img"
        :aria-label="t(priority.labelKey)"
      />
    </div>

    <p class="mt-1 line-clamp-3 text-sm font-medium">{{ task.title }}</p>

    <div v-if="task.labels.length > 0" class="mt-2 flex flex-wrap gap-1">
      <Tag
        v-for="label in task.labels"
        :key="label.id"
        :tone="labelTone(label)"
      >
        {{ label.name }}
      </Tag>
    </div>

    <div
      class="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground"
    >
      <span
        v-if="dueDateLabel"
        class="flex items-center gap-1"
        :class="{ 'font-medium text-destructive': overdue }"
      >
        <CalendarIcon class="size-3.5" />
        {{ dueDateLabel }}
      </span>
      <span v-else />

      <span v-if="task.subtaskCount > 0" class="shrink-0">
        {{
          t('task.card.subtaskProgress', {
            done: task.subtaskDoneCount,
            total: task.subtaskCount,
          })
        }}
      </span>
    </div>

    <div
      v-if="task.assignedAgent"
      class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <UserIcon class="size-3.5" />
      <span class="truncate">{{ task.assignedAgent.name }}</span>
    </div>
  </NuxtLinkLocale>
</template>
