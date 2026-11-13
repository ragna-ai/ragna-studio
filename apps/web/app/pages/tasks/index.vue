<script setup lang="ts">
import { storeToRefs } from 'pinia';
import ViewSwitcher from '~/components/ViewSwitcher.vue';
import TaskBoard from '~/features/task/components/TaskBoard.vue';
import TaskCreateDialog from '~/features/task/components/TaskCreateDialog.vue';
import TaskFilterBar from '~/features/task/components/TaskFilterBar.vue';
import TaskLabelManageDialog from '~/features/task/components/TaskLabelManageDialog.vue';
import TaskListView from '~/features/task/components/TaskListView.vue';
import { useGetTasks } from '~/features/task/composables/useTaskApi';
import { useGetTaskLabels } from '~/features/task/composables/useTaskLabelApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';
import { TASK_VIEWS, type TaskView } from '~/features/task/lib/task-views';
import type { TaskPriority, TaskStatus } from '~/features/task/types';

// Refs
// View choice persists across visits;
// filters are in-memory only and shared between both views so switching
// never refetches differently.
const view = useLocalStorage<TaskView>('tasks:view', 'board');
const statusFilter = ref<TaskStatus | null>(null);
const priorityFilter = ref<TaskPriority | null>(null);
const taskLabelIdFilter = ref<string | null>(null);
const isCreateDialogOpen = ref(false);
const createStatus = ref<TaskStatus>('backlog');
const isLabelManageOpen = ref(false);

// Composables
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { t } = useI18n();

const {
  data: tasksData,
  error: tasksError,
  refetch,
} = useGetTasks({
  status: statusFilter,
  priority: priorityFilter,
  taskLabelId: taskLabelIdFilter,
});
const { data: labelsData } = useGetTaskLabels();

useHead({ title: t('task.list.title') });

// Computed
const tasks = computed(() => tasksData.value?.tasks ?? []);
const labels = computed(() => labelsData.value?.taskLabels ?? []);
const isBoard = computed(() => view.value === 'board');
const hasFilters = computed(
  () =>
    statusFilter.value !== null ||
    priorityFilter.value !== null ||
    taskLabelIdFilter.value !== null,
);
const hasLoadError = computed(() => !!tasksError.value && !tasksData.value);
const isLoading = computed(
  () => !activeWorkspaceId.value || (!tasksData.value && !tasksError.value),
);
const hasNoTasksAtAll = computed(
  () => !!tasksData.value && tasks.value.length === 0 && !hasFilters.value,
);
const hasNoResults = computed(
  () => !!tasksData.value && tasks.value.length === 0 && hasFilters.value,
);

// A hidden filter must not empty the board's columns.
watch(isBoard, (nowBoard) => {
  if (nowBoard) {
    statusFilter.value = null;
  }
});

// Functions
function openCreateDialog(status: TaskStatus) {
  createStatus.value = status;
  isCreateDialogOpen.value = true;
}

function clearFilters() {
  statusFilter.value = null;
  priorityFilter.value = null;
  taskLabelIdFilter.value = null;
}
</script>

<template>
  <PagePanel>
    <SectionWrapper :class="{ 'h-full': isBoard && !hasNoTasksAtAll }">
      <Heading>
        <template #top>
          <HeadingTitle
            :title="t('task.list.title')"
            :subtitle="t('task.list.subtitle')"
          >
            <template #button>
              <Button
                variant="outline"
                :disabled="!activeWorkspaceId"
                leading-icon="hugeicons:tag-01"
                @click="isLabelManageOpen = true"
              >
                {{ t('task.label.manageTitle') }}
              </Button>
              <Button
                :disabled="!activeWorkspaceId"
                leading-icon="hugeicons:plus-sign"
                @click="openCreateDialog('backlog')"
              >
                {{ t('task.list.newTask') }}
              </Button>
            </template>
          </HeadingTitle>
        </template>
      </Heading>

      <div v-if="hasLoadError" class="px-page pt-6">
        <ListErrorAlert
          :title="t('task.list.loadError.title')"
          :description="t('task.list.loadError.description')"
          @retry="refetch()"
        />
      </div>
      <div v-else-if="hasNoTasksAtAll" class="px-page pt-24">
        <Empty>
          <EmptyMedia variant="icon">
            <Icon name="hugeicons:task-done-01" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{{ t('task.list.empty.title') }}</EmptyTitle>
            <EmptyDescription>
              {{ t('task.list.empty.description') }}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              leading-icon="hugeicons:plus-sign"
              @click="openCreateDialog('backlog')"
            >
              {{ t('task.list.newTask') }}
            </Button>
          </EmptyContent>
        </Empty>
      </div>
      <template v-else>
        <div class="shrink-0 px-page pt-6">
          <div class="flex h-11 items-center justify-between gap-3 border-b">
            <ViewSwitcher v-model="view" :options="TASK_VIEWS" size="sm" />
            <TaskFilterBar
              :status="statusFilter"
              :priority="priorityFilter"
              :task-label-id="taskLabelIdFilter"
              :labels="labels"
              :hide-status="isBoard"
              @update:status="(v) => (statusFilter = v)"
              @update:priority="(v) => (priorityFilter = v)"
              @update:task-label-id="(v) => (taskLabelIdFilter = v)"
            />
          </div>
        </div>

        <Empty v-if="hasNoResults" size="sm" class="mt-24">
          <EmptyHeader>
            <EmptyTitle>{{ t('task.list.noResults.title') }}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="ghost" @click="clearFilters">
              {{ t('task.list.noResults.clearFilters') }}
            </Button>
          </EmptyContent>
        </Empty>
        <TaskBoard
          v-else-if="isBoard"
          :tasks="tasks"
          :is-loading="isLoading"
          @create="openCreateDialog"
        />
        <TaskListView
          v-else
          :tasks="tasks"
          :is-loading="isLoading"
          @create="openCreateDialog"
        />
      </template>

      <template v-if="activeWorkspaceId">
        <TaskCreateDialog
          v-model:open="isCreateDialogOpen"
          :status="createStatus"
        />
        <TaskLabelManageDialog
          v-model:open="isLabelManageOpen"
          :labels="labels"
        />
      </template>
    </SectionWrapper>
  </PagePanel>
</template>
