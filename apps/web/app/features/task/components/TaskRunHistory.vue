<script setup lang="ts">
import TaskRunItem from '~/features/task/components/TaskRunItem.vue';
import { useGetTaskRuns } from '~/features/task/composables/useTaskRunApi';

interface TaskRunHistoryProps {
  taskId: string;
}

// Props
const props = defineProps<TaskRunHistoryProps>();

// Composables
const { t } = useI18n();
const { data } = useGetTaskRuns(() => props.taskId);

// Computed
const runs = computed(() => data.value?.runs ?? []);
</script>

<template>
  <section
    v-if="runs.length > 0"
    class="space-y-3"
    :aria-label="t('task.run.historyTitle')"
  >
    <p class="text-sm font-semibold">{{ t('task.run.historyTitle') }}</p>
    <ul class="flex flex-col gap-3">
      <TaskRunItem v-for="run in runs" :key="run.id" :run="run" />
    </ul>
  </section>
</template>
