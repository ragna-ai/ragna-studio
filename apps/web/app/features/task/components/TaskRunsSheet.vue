<script setup lang="ts">
import TaskRunItem from '~/features/task/components/TaskRunItem.vue';
import { useGetTaskRuns } from '~/features/task/composables/useTaskRunApi';
import { useTaskRunHighlight } from '~/features/task/composables/useTaskRunHighlight';

interface TaskRunsSheetProps {
  taskId: string;
}

// Props
const props = defineProps<TaskRunsSheetProps>();

// Refs
const open = defineModel<boolean>('open', { required: true });

// Composables
const { t } = useI18n();
const { data } = useGetTaskRuns(() => props.taskId);
const { highlightedRunId } = useTaskRunHighlight();

// Computed
const runs = computed(() => data.value?.runs ?? []);

// Hooks
// A comment's "From run" link highlights its run, which lives in this sheet.
watch(highlightedRunId, (runId) => {
  if (runId) {
    open.value = true;
  }
});
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" class="gap-0 p-0">
      <SheetHeader>
        <SheetTitle>{{ t('task.run.historyTitle') }}</SheetTitle>
        <SheetDescription class="sr-only">
          {{ t('task.run.historyTitle') }}
        </SheetDescription>
      </SheetHeader>
      <div class="min-h-0 flex-1 overflow-y-auto p-6">
        <p v-if="runs.length === 0" class="text-sm text-muted-foreground">
          {{ t('task.run.historyEmpty') }}
        </p>
        <ul v-else class="flex flex-col gap-3">
          <TaskRunItem v-for="run in runs" :key="run.id" :run="run" />
        </ul>
      </div>
    </SheetContent>
  </Sheet>
</template>
