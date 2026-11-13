<script setup lang="ts">
import TaskBoardColumnHeader from '~/features/task/components/TaskBoardColumnHeader.vue';
import { labelTone } from '~/features/task/lib/label-tone';
import {
  formatTaskDisplayId,
  isTaskOverdue,
  priorityOption,
  STATUS_COLUMNS,
} from '~/features/task/lib/task-display';
import type { TaskStatus, TaskWithBoardInfo } from '~/features/task/types';
import { cn } from '~/lib/utils';

interface TaskListViewProps {
  tasks: TaskWithBoardInfo[];
  isLoading?: boolean;
}

// Props
const props = defineProps<TaskListViewProps>();

// Emits
const emit = defineEmits<{ create: [status: TaskStatus] }>();

// Composables
const { t } = useI18n();
const { formatDate } = useDateTimeFormat();

// Computed
// Grouped by status in the fixed column order, each group's rows already
// arrive sorted by sortOrder from the shared list query.
// No drag-and-drop here, reordering happens on the board.
const groups = computed(() =>
  STATUS_COLUMNS.map((status) => ({
    status,
    tasks: props.tasks.filter((task) => task.status === status.value),
  })).filter((group) => group.tasks.length > 0),
);
</script>

<template>
  <Table
    class="[&_td:first-child]:pl-page [&_td:last-child]:pr-page [&_th:first-child]:pl-page [&_th:last-child]:pr-page"
  >
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead class="w-px pr-0">
          <span class="sr-only">{{ t('task.list.table.priority') }}</span>
        </TableHead>
        <TableHead class="w-18">{{ t('task.list.table.id') }}</TableHead>
        <TableHead>{{ t('common.title') }}</TableHead>
        <TableHead class="w-40">{{ t('task.list.table.labels') }}</TableHead>
        <TableHead class="w-28">{{ t('task.list.table.dueDate') }}</TableHead>
        <TableHead class="w-50">{{ t('task.list.table.assignee') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <ListSkeletonRows
        v-if="isLoading"
        :columns="['none', 'bar', 'bar', 'bar', 'bar', 'bar']"
      />
      <template v-for="group in groups" v-else :key="group.status.value">
        <TableRow class="hover:bg-transparent">
          <TableCell colspan="6" class="h-9 bg-surface-subtle p-0">
            <TaskBoardColumnHeader
              :status="group.status"
              :count="group.tasks.length"
              class="-mr-1.5 pr-0 pl-0"
              @create="emit('create', group.status.value)"
            />
          </TableCell>
        </TableRow>
        <TableRow
          v-for="task in group.tasks"
          :key="task.id"
          class="cursor-pointer"
          @click="navigateTo(`/tasks/${task.id}`)"
        >
          <TableCell class="w-px pr-0">
            <Icon
              :name="priorityOption(task.priority).icon"
              :class="
                cn('size-3.5 shrink-0', priorityOption(task.priority).iconClass)
              "
              role="img"
              :aria-label="t(priorityOption(task.priority).labelKey)"
            />
          </TableCell>
          <TableCell class="text-mono text-muted-foreground">
            {{ formatTaskDisplayId(task.number) }}
          </TableCell>
          <TableCell class="max-w-0 truncate font-medium">
            <NuxtLinkLocale :to="`/tasks/${task.id}`">{{
              task.title
            }}</NuxtLinkLocale>
          </TableCell>
          <TableCell>
            <div class="flex gap-1 overflow-hidden">
              <Tag
                v-for="label in task.labels"
                :key="label.id"
                :tone="labelTone(label)"
              >
                {{ label.name }}
              </Tag>
            </div>
          </TableCell>
          <TableCell
            :class="
              cn(
                'text-mono text-muted-foreground',
                isTaskOverdue(task) && 'text-status-danger-fg',
              )
            "
          >
            <template v-if="task.dueDate">
              <span v-if="isTaskOverdue(task)" class="sr-only">{{
                t('task.card.overdue', { date: formatDate(task.dueDate) })
              }}</span>
              <span :aria-hidden="isTaskOverdue(task)">{{
                formatDate(task.dueDate)
              }}</span>
            </template>
          </TableCell>
          <TableCell>
            <div v-if="task.assignedAgent" class="flex items-center gap-2">
              <Icon
                name="hugeicons:user"
                class="size-3.5 shrink-0 text-icon"
                aria-hidden="true"
              />
              <span class="truncate">{{ task.assignedAgent.name }}</span>
            </div>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </Table>
</template>
