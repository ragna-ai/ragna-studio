<script setup lang="ts">
import { UserIcon } from '@lucide/vue';
import {
  formatTaskDisplayId,
  isTaskOverdue,
  priorityIcon,
  STATUS_COLUMNS,
} from '~/features/task/lib/task-display';
import type { TaskWithBoardInfo } from '~/features/task/types';

// Props
const props = defineProps<{ tasks: TaskWithBoardInfo[] }>();

// Composables
const { t } = useI18n();
const { formatDate } = useDateTimeFormat();

// Computed
// Grouped by status in the fixed column order, each group's rows already
// arrive sorted by sortOrder from the shared list query (docs/tasks/prd.md,
// "List view"). No drag-and-drop here, reordering happens on the board.
const groups = computed(() =>
  STATUS_COLUMNS.map((column) => ({
    ...column,
    tasks: props.tasks.filter((task) => task.status === column.value),
  })).filter((group) => group.tasks.length > 0),
);

function rowClass(task: TaskWithBoardInfo): Record<string, boolean> {
  return { 'text-destructive': isTaskOverdue(task) };
}
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead class="w-20">{{ t('task.list.table.id') }}</TableHead>
        <TableHead>{{ t('common.title') }}</TableHead>
        <TableHead class="w-28">{{ t('task.list.table.priority') }}</TableHead>
        <TableHead>{{ t('task.list.table.labels') }}</TableHead>
        <TableHead class="w-32">{{ t('task.list.table.dueDate') }}</TableHead>
        <TableHead class="w-40">{{ t('task.list.table.assignee') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="tasks.length === 0" :colspan="6">
        {{ t('task.list.empty') }}
      </TableEmpty>
      <template v-for="group in groups" :key="group.value">
        <TableRow class="hover:bg-transparent">
          <TableCell colspan="6" class="bg-stone-50 text-xs font-semibold text-muted-foreground">
            {{ t(group.labelKey) }} · {{ group.tasks.length }}
          </TableCell>
        </TableRow>
        <TableRow
          v-for="task in group.tasks"
          :key="task.id"
          class="cursor-pointer"
          @click="navigateTo(`/tasks/${task.id}`)"
        >
          <TableCell class="whitespace-nowrap text-xs text-muted-foreground">
            {{ formatTaskDisplayId(task.number) }}
          </TableCell>
          <TableCell class="text-sm font-medium">{{ task.title }}</TableCell>
          <TableCell>
            <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
              <component
                :is="priorityIcon(task.priority)"
                v-if="task.priority !== 'none'"
                class="size-3.5"
              />
              <span>{{ t(`task.priority.${task.priority}`) }}</span>
            </div>
          </TableCell>
          <TableCell>
            <div class="flex flex-wrap gap-1">
              <Badge
                v-for="label in task.labels"
                :key="label.id"
                variant="outline"
                :style="{ borderColor: label.color, color: label.color }"
              >
                {{ label.name }}
              </Badge>
            </div>
          </TableCell>
          <TableCell class="whitespace-nowrap text-sm" :class="rowClass(task)">
            {{ task.dueDate ? formatDate(task.dueDate) : '—' }}
          </TableCell>
          <TableCell class="whitespace-nowrap text-sm">
            <div v-if="task.assignedAgent" class="flex items-center gap-1.5">
              <UserIcon class="size-3.5 text-muted-foreground" />
              <span class="truncate">{{ task.assignedAgent.name }}</span>
            </div>
            <span v-else class="text-muted-foreground">—</span>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </Table>
</template>
