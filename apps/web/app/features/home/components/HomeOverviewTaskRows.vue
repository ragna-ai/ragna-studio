<script setup lang="ts">
import type { HomeOverviewTaskItem } from '~/features/home/types';
import {
  formatTaskDisplayId,
  isTaskOverdue,
  priorityIcon,
  priorityLabelKey,
  STATUS_COLUMNS,
} from '~/features/task/lib/task-display';

// Props
const props = defineProps<{ tasks: HomeOverviewTaskItem[] }>();

// Composables
const { t } = useI18n();
const { formatDate } = useDateTimeFormat();

// Computed
// Client-side grouping only, same pattern as TaskListView.vue
// (specs/home/prd.md, "Tasks card"): the API returns a flat recency-sorted
// list, and header counts are within-card counts, not workspace totals.
const groups = computed(() =>
  STATUS_COLUMNS.map((column) => ({
    ...column,
    tasks: props.tasks.filter((task) => task.status === column.value),
  })).filter((group) => group.tasks.length > 0),
);
</script>

<template>
  <div class="divide-y divide-foreground/5">
    <template v-for="group in groups" :key="group.value">
      <div class="font-base px-6 py-1.5 text-xs text-muted-foreground">
        {{ t(group.labelKey) }} · {{ group.tasks.length }}
      </div>
      <NuxtLinkLocale
        v-for="task in group.tasks"
        :key="task.id"
        :to="`/tasks/${task.id}`"
        class="flex items-center gap-3 px-6 py-2.5 text-sm hover:bg-accent"
      >
        <span class="shrink-0 text-xs text-muted-foreground">
          {{ formatTaskDisplayId(task.number) }}
        </span>
        <span class="grow truncate font-medium text-foreground">{{
          task.title
        }}</span>
        <component
          :is="priorityIcon(task.priority)"
          v-if="task.priority !== 'none'"
          class="size-3.5 shrink-0 text-muted-foreground"
          :title="t(priorityLabelKey(task.priority))"
        />
        <span
          v-if="task.dueDate"
          class="shrink-0 text-xs whitespace-nowrap"
          :class="
            isTaskOverdue(task) ? 'text-destructive' : 'text-muted-foreground'
          "
        >
          {{ formatDate(task.dueDate) }}
        </span>
      </NuxtLinkLocale>
    </template>
  </div>
</template>
