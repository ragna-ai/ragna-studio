<script setup lang="ts">
import type { DraggableEvent } from 'vue-draggable-plus';
import { VueDraggable } from 'vue-draggable-plus';
import TaskBoardColumnHeader from '~/features/task/components/TaskBoardColumnHeader.vue';
import TaskCard from '~/features/task/components/TaskCard.vue';
import { useMoveTask } from '~/features/task/composables/useTaskApi';
import { isTaskStatus, STATUS_COLUMNS } from '~/features/task/lib/task-display';
import type { TaskStatus, TaskWithBoardInfo } from '~/features/task/types';

interface TaskBoardProps {
  tasks: TaskWithBoardInfo[];
  isLoading?: boolean;
}

type ColumnState = Record<TaskStatus, TaskWithBoardInfo[]>;

const SKELETON_CARDS_PER_LANE = 3;

// Props
const props = defineProps<TaskBoardProps>();

// Emits
const emit = defineEmits<{ create: [status: TaskStatus] }>();

// Composables
const { mutate: moveTask } = useMoveTask();

// Functions
function tasksWithStatus(
  tasks: TaskWithBoardInfo[],
  status: TaskStatus,
): TaskWithBoardInfo[] {
  return tasks.filter((task) => task.status === status);
}

function buildColumns(tasks: TaskWithBoardInfo[]): ColumnState {
  return {
    backlog: tasksWithStatus(tasks, 'backlog'),
    todo: tasksWithStatus(tasks, 'todo'),
    in_progress: tasksWithStatus(tasks, 'in_progress'),
    in_review: tasksWithStatus(tasks, 'in_review'),
    done: tasksWithStatus(tasks, 'done'),
    canceled: tasksWithStatus(tasks, 'canceled'),
  };
}

// Refs
// Local per-column arrays that vue-draggable-plus mutates directly during a
// drag. Re-synced from `props.tasks` whenever the shared query refetches:
// there's no realtime sync in v1, so this is also how agent-made changes
// appear after a reload.
const columns = ref<ColumnState>(buildColumns(props.tasks));

watch(
  () => props.tasks,
  (tasks) => {
    columns.value = buildColumns(tasks);
  },
);

// vue-draggable-plus already spliced the dragged card into its destination
// column's array by the time `@end` fires; `nextTick` just guards against
// that sync landing on the following microtask. `afterTaskId` is the id of
// the card now directly above the dropped one;
// an empty column means top-of-column, so it's omitted.
function handleDragEnd(event: DraggableEvent<TaskWithBoardInfo>) {
  const toStatus = event.to.dataset.status;
  if (!isTaskStatus(toStatus)) {
    return;
  }

  const rollbackSnapshot = buildColumns(props.tasks);

  nextTick(() => {
    const columnTasks = columns.value[toStatus];
    const newIndex = event.newIndex ?? 0;
    const movedTask = columnTasks[newIndex];
    if (!movedTask) {
      return;
    }
    const afterTask = columnTasks[newIndex - 1];

    moveTask(
      {
        taskId: movedTask.id,
        status: toStatus,
        afterTaskId: afterTask?.id ?? null,
      },
      {
        onError: () => {
          columns.value = rollbackSnapshot;
        },
      },
    );
  });
}
</script>

<template>
  <div class="flex min-h-0 flex-1 gap-3 overflow-x-auto pt-6 pr-page pl-page">
    <div
      v-for="column in STATUS_COLUMNS"
      :key="column.value"
      class="flex w-66 shrink-0 flex-col rounded-lg bg-surface-subtle px-2 pt-1 pb-2"
    >
      <TaskBoardColumnHeader
        :status="column"
        :count="columns[column.value].length"
        :hide-count="isLoading"
        @create="emit('create', column.value)"
      />

      <div v-if="isLoading" class="mt-2 flex flex-col gap-2" aria-hidden="true">
        <div
          v-for="n in SKELETON_CARDS_PER_LANE"
          :key="n"
          class="flex flex-col gap-2 rounded-md border bg-card p-3"
        >
          <Skeleton class="h-3 w-12 rounded-sm" />
          <Skeleton class="h-3.5 w-50 rounded-sm" />
          <Skeleton class="h-3.5 w-35 rounded-sm" />
          <Skeleton class="h-3 w-24 rounded-sm" />
        </div>
      </div>
      <VueDraggable
        v-else
        v-model="columns[column.value]"
        :data-status="column.value"
        group="tasks-board"
        :animation="150"
        force-fallback
        fallback-class="task-card-lifted"
        ghost-class="opacity-40"
        class="mt-2 flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto"
        @end="handleDragEnd"
      >
        <TaskCard
          v-for="task in columns[column.value]"
          :key="task.id"
          :task="task"
        />
      </VueDraggable>
    </div>
  </div>
</template>
