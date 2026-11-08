<script setup lang="ts">
import HomeOverviewRow from '~/features/home/components/HomeOverviewRow.vue';
import { isSameDay, startOfDay } from '~/features/home/lib/dashboard';
import type { HomeOverviewTaskItem } from '~/features/home/types';
import { formatTaskDisplayId } from '~/features/task/lib/task-display';

interface HomeOverviewTaskRowsProps {
  tasks: HomeOverviewTaskItem[];
}

defineProps<HomeOverviewTaskRowsProps>();

const { t, localeProperties } = useI18n();

const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(localeProperties.value.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }),
);

function isDueToday(task: HomeOverviewTaskItem): boolean {
  return !!task.dueDate && isSameDay(new Date(task.dueDate), new Date());
}

function dueLabel(task: HomeOverviewTaskItem): string {
  if (!task.dueDate) return '';
  const due = new Date(task.dueDate);
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(due, today)) return t('home.dashboard.tasks.dueToday');
  if (isSameDay(due, tomorrow)) return t('home.dashboard.tasks.dueTomorrow');
  return dateFormatter.value.format(due);
}
</script>

<template>
  <HomeOverviewRow
    v-for="task in tasks"
    :key="task.id"
    :to="`/tasks/${task.id}`"
  >
    <span class="w-14 shrink-0 font-mono text-caption text-muted-foreground">{{
      formatTaskDisplayId(task.number)
    }}</span>
    <span class="min-w-0 grow truncate text-body">{{ task.title }}</span>
    <span
      data-testid="task-due"
      class="w-24 shrink-0 text-right text-small whitespace-nowrap"
      :class="isDueToday(task) ? 'text-foreground' : 'text-muted-foreground'"
      >{{ dueLabel(task) }}</span
    >
  </HomeOverviewRow>
</template>
