<script setup lang="ts">
import TaskQuickAddInput from '~/features/task/components/TaskQuickAddInput.vue';
import { useCreateTask } from '~/features/task/composables/useTaskApi';
import { formatTaskDisplayId, statusLabelKey } from '~/features/task/lib/task-display';
import type { Task } from '~/features/task/types';

// Props
const props = defineProps<{ parentTaskId: string; subtasks: Task[] }>();

// Composables
const { t } = useI18n();
const { mutate: createTask, isPending } = useCreateTask();

// Functions
// One level deep only (docs/tasks/prd.md): a subtask can never itself have
// subtasks, so this quick-add never needs its own nested add.
function handleCreate(title: string) {
  createTask({ title, parentTaskId: props.parentTaskId });
}
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm font-semibold">{{ t('task.detail.subtasks') }}</p>

    <ul v-if="subtasks.length > 0" class="divide-y rounded-md border">
      <li v-for="subtask in subtasks" :key="subtask.id">
        <NuxtLinkLocale
          :to="`/tasks/${subtask.id}`"
          class="flex items-center gap-3 px-3 py-2 text-sm hover:bg-stone-50"
        >
          <span class="shrink-0 text-xs text-muted-foreground">
            {{ formatTaskDisplayId(subtask.number) }}
          </span>
          <span class="flex-1 truncate">{{ subtask.title }}</span>
          <Badge variant="secondary">{{ t(statusLabelKey(subtask.status)) }}</Badge>
        </NuxtLinkLocale>
      </li>
    </ul>

    <TaskQuickAddInput
      :placeholder="t('task.detail.addSubtaskPlaceholder')"
      :pending="isPending"
      @create="handleCreate"
    />
  </div>
</template>
