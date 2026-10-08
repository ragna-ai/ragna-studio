<script setup lang="ts">
import { TagIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import TaskBoard from '~/features/task/components/TaskBoard.vue';
import TaskCreateDialog from '~/features/task/components/TaskCreateDialog.vue';
import TaskFilterBar from '~/features/task/components/TaskFilterBar.vue';
import TaskLabelManageDialog from '~/features/task/components/TaskLabelManageDialog.vue';
import TaskListView from '~/features/task/components/TaskListView.vue';
import TaskViewSwitcher, {
  type TaskView,
} from '~/features/task/components/TaskViewSwitcher.vue';
import { useGetTasks } from '~/features/task/composables/useTaskApi';
import { useGetTaskLabels } from '~/features/task/composables/useTaskLabelApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';
import type { TaskPriority, TaskStatus } from '~/features/task/types';

// Refs
// View choice persists across visits (specs/tasks/prd.md, "Tasks page");
// filters are in-memory only and shared between both views so switching
// never refetches differently.
const view = useLocalStorage<TaskView>('tasks:view', 'board');
const statusFilter = ref<TaskStatus | null>(null);
const priorityFilter = ref<TaskPriority | null>(null);
const taskLabelIdFilter = ref<string | null>(null);
const isCreateDialogOpen = ref(false);
const isLabelManageOpen = ref(false);

// Composables
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { t } = useI18n();

const { data: tasksData, error: tasksError } = useGetTasks({
  status: statusFilter,
  priority: priorityFilter,
  taskLabelId: taskLabelIdFilter,
});
const { data: labelsData } = useGetTaskLabels();

useHead({ title: t('task.list.title') });

// Computed
const tasks = computed(() => tasksData.value?.tasks ?? []);
const labels = computed(() => labelsData.value?.taskLabels ?? []);
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle :title="t('task.list.title')" :subtitle="t('task.list.subtitle')">
          <template #button>
            <div class="flex gap-2">
              <Button
                variant="secondary"
                :disabled="!activeWorkspaceId"
                @click="isLabelManageOpen = true"
              >
                <TagIcon class="mr-2 size-4 stroke-1.5" />
                {{ t('task.label.manageTitle') }}
              </Button>
              <Button variant="secondary" :disabled="!activeWorkspaceId" @click="isCreateDialogOpen = true">
                {{ t('task.list.newTask') }}
              </Button>
            </div>
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>

    <div class="space-y-4 px-5">
      <div v-if="!activeWorkspaceId" class="rounded-lg border p-6 text-sm text-muted-foreground">
        {{ t('task.list.loading') }}
      </div>
      <template v-else-if="tasksData">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <TaskViewSwitcher v-model="view" />
          <TaskFilterBar
            :status="statusFilter"
            :priority="priorityFilter"
            :task-label-id="taskLabelIdFilter"
            :labels="labels"
            @update:status="(v) => (statusFilter = v)"
            @update:priority="(v) => (priorityFilter = v)"
            @update:task-label-id="(v) => (taskLabelIdFilter = v)"
          />
        </div>

        <TaskBoard v-if="view === 'board'" :tasks="tasks" />
        <TaskListView v-else :tasks="tasks" />
      </template>
      <div v-else-if="tasksError">
        <p class="text-sm text-stone-500">
          {{ tasksError.message || t('task.list.loadError') }}
        </p>
      </div>
    </div>

    <template v-if="activeWorkspaceId">
      <TaskCreateDialog v-model:open="isCreateDialogOpen" />
      <TaskLabelManageDialog v-model:open="isLabelManageOpen" :labels="labels" />
    </template>
  </SectionWrapper>
</template>
