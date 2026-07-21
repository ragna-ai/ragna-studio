<script setup lang="ts">
import type { DraggableEvent } from 'vue-draggable-plus';
import { VueDraggable } from 'vue-draggable-plus';
import TaskCard from '~/features/task/components/TaskCard.vue';
import TaskQuickAddInput from '~/features/task/components/TaskQuickAddInput.vue';
import { useCreateTask, useMoveTask } from '~/features/task/composables/useTaskApi';
import { STATUS_COLUMNS } from '~/features/task/lib/task-display';
import type { TaskStatus, TaskWithBoardInfo } from '~/features/task/types';

// Props
const props = defineProps<{ tasks: TaskWithBoardInfo[] }>();

// Composables
const { t } = useI18n();
const { mutate: moveTask } = useMoveTask();
const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();

// Refs
// Local per-column arrays that vue-draggable-plus mutates directly during a
// drag (docs/tasks/prd.md, "Board view"). Re-synced from `props.tasks`
// whenever the shared query refetches: there's no realtime sync in v1, so
// this is also how agent-made changes appear after a reload.
type ColumnState = Record<TaskStatus, TaskWithBoardInfo[]>;

function buildColumns(tasks: TaskWithBoardInfo[]): ColumnState {
  const columns = {} as ColumnState;
  for (const column of STATUS_COLUMNS) {
    columns[column.value] = tasks.filter((task) => task.status === column.value);
  }
  return columns;
}

const columns = reactive<ColumnState>(buildColumns(props.tasks));

watch(
  () => props.tasks,
  (tasks) => {
    const next = buildColumns(tasks);
    for (const column of STATUS_COLUMNS) {
      columns[column.value] = next[column.value];
    }
  },
);

// Functions
// vue-draggable-plus already spliced the dragged card into its destination
// column's array by the time `@end` fires; `nextTick` just guards against
// that sync landing on the following microtask. `afterTaskId` is the id of
// the card now directly above the dropped one (docs/tasks/prd.md, "Move");
// an empty column means top-of-column, so it's omitted.
function handleDragEnd(event: DraggableEvent<TaskWithBoardInfo>) {
  const toStatus = (event.to as HTMLElement | undefined)?.dataset.status as
    | TaskStatus
    | undefined;
  if (!toStatus) {
    return;
  }

  const rollbackSnapshot = buildColumns(props.tasks);

  nextTick(() => {
    const columnTasks = columns[toStatus];
    const newIndex = event.newIndex ?? 0;
    const movedTask = columnTasks[newIndex];
    if (!movedTask) {
      return;
    }
    const afterTask = columnTasks[newIndex - 1];

    moveTask(
      { taskId: movedTask.id, status: toStatus, afterTaskId: afterTask?.id ?? null },
      {
        onError: () => {
          for (const column of STATUS_COLUMNS) {
            columns[column.value] = rollbackSnapshot[column.value];
          }
        },
      },
    );
  });
}

function handleQuickAdd(status: TaskStatus, title: string) {
  createTask({ title, status });
}
</script>

<template>
  <div class="flex gap-4 overflow-x-auto pb-4">
    <div
      v-for="column in STATUS_COLUMNS"
      :key="column.value"
      class="flex w-72 shrink-0 flex-col rounded-lg bg-stone-50"
    >
      <div class="flex items-center justify-between px-3 py-2">
        <p class="text-sm font-semibold">{{ t(column.labelKey) }}</p>
        <span class="text-xs text-muted-foreground">{{ columns[column.value].length }}</span>
      </div>

      <VueDraggable
        v-model="columns[column.value]"
        :data-status="column.value"
        group="tasks-board"
        :animation="150"
        class="flex min-h-12 flex-col gap-2 overflow-y-auto px-3 pb-2"
        style="max-height: 65vh"
        ghost-class="opacity-40"
        @end="handleDragEnd"
      >
        <TaskCard v-for="task in columns[column.value]" :key="task.id" :task="task" />
      </VueDraggable>

      <div class="px-3 pb-3">
        <TaskQuickAddInput
          :placeholder="t('task.board.quickAddPlaceholder')"
          :pending="isCreatingTask"
          @create="(title) => handleQuickAdd(column.value, title)"
        />
      </div>
    </div>
  </div>
</template>
