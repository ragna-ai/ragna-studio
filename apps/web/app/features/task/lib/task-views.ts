import type { ViewOption } from '~/components/ViewSwitcher.vue';
import { ListIcon, SquareKanbanIcon } from '@lucide/vue';

export type TaskView = 'board' | 'list';

export const TASK_VIEWS: readonly ViewOption<TaskView>[] = [
  { value: 'board', labelKey: 'task.view.board', icon: SquareKanbanIcon },
  { value: 'list', labelKey: 'task.view.list', icon: ListIcon },
];
