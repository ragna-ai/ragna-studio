<script setup lang="ts">
import { labelTone } from '~/features/task/lib/label-tone';
import {
  formatTaskDisplayId,
  isTaskOverdue,
  priorityOption,
} from '~/features/task/lib/task-display';
import type { TaskWithBoardInfo } from '~/features/task/types';
import { cn } from '~/lib/utils';

interface TaskCardProps {
  task: TaskWithBoardInfo;
}

// Props
const props = defineProps<TaskCardProps>();

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
const hasMeta = computed(
  () => dueDateLabel.value !== null || props.task.subtaskCount > 0,
);
</script>

<template>
  <NuxtLinkLocale
    :to="`/tasks/${task.id}`"
    class="block w-full cursor-pointer rounded-md border bg-card p-3 shadow-xs transition-colors hover:border-border-strong"
  >
    <div class="flex items-center gap-1.5">
      <Icon
        :name="priority.icon"
        :class="cn('size-3.5 shrink-0', priority.iconClass)"
        role="img"
        :aria-label="t(priority.labelKey)"
      />
      <span class="text-mono-sm text-muted-foreground">{{ displayId }}</span>
    </div>

    <p class="mt-1 line-clamp-3 text-body font-medium">{{ task.title }}</p>

    <div v-if="task.labels.length > 0" class="mt-2 flex flex-wrap gap-1">
      <Tag
        v-for="label in task.labels"
        :key="label.id"
        :tone="labelTone(label)"
      >
        {{ label.name }}
      </Tag>
    </div>

    <div v-if="hasMeta" class="mt-3 flex items-center gap-3">
      <span
        v-if="dueDateLabel"
        :class="
          cn(
            'flex items-center gap-1 text-mono-sm text-muted-foreground',
            overdue && 'text-status-danger-fg',
          )
        "
      >
        <Icon
          name="hugeicons:calendar-03"
          :class="cn('size-3.5 text-icon', overdue && 'text-status-danger-fg')"
          aria-hidden="true"
        />
        <span v-if="overdue" class="sr-only">{{
          t('task.card.overdue', { date: dueDateLabel })
        }}</span>
        <span :aria-hidden="overdue">{{ dueDateLabel }}</span>
      </span>
      <span
        v-if="task.subtaskCount > 0"
        class="flex items-center gap-1 text-mono-sm text-muted-foreground"
      >
        <Icon
          name="hugeicons:task-done-01"
          class="size-3.5 text-icon"
          aria-hidden="true"
        />
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
      class="mt-2 flex items-center gap-1.5 text-caption text-muted-foreground"
    >
      <Icon
        name="hugeicons:user"
        class="size-3.5 text-icon"
        aria-hidden="true"
      />
      <span class="truncate">{{ task.assignedAgent.name }}</span>
    </div>
  </NuxtLinkLocale>
</template>
