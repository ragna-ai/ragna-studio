<script setup lang="ts">
import HomeOverviewRow from '~/features/home/components/HomeOverviewRow.vue';
import { hasTimeOfDay } from '~/features/home/lib/dashboard';
import type { HomeOverviewCalendarTaskItem } from '~/features/home/types';
import { formatTaskDisplayId } from '~/features/task/lib/task-display';

interface HomeOverviewTodayRowsProps {
  tasks: HomeOverviewCalendarTaskItem[];
}

defineProps<HomeOverviewTodayRowsProps>();

const { localeProperties } = useI18n();

const timeFormatter = computed(
  () =>
    new Intl.DateTimeFormat(localeProperties.value.language, {
      hour: '2-digit',
      minute: '2-digit',
    }),
);

function timeLabel(task: HomeOverviewCalendarTaskItem): string {
  if (!task.dueDate || !hasTimeOfDay(task.dueDate)) return '';
  return timeFormatter.value.format(new Date(task.dueDate));
}
</script>

<template>
  <HomeOverviewRow
    v-for="task in tasks"
    :key="task.id"
    :to="`/tasks/${task.id}`"
  >
    <span class="w-11 shrink-0 font-mono text-caption">{{
      timeLabel(task)
    }}</span>
    <span class="min-w-0 grow truncate text-body">{{ task.title }}</span>
    <span class="shrink-0 font-mono text-caption text-muted-foreground">{{
      formatTaskDisplayId(task.number)
    }}</span>
  </HomeOverviewRow>
</template>
