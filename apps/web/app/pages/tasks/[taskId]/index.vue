<script setup lang="ts">
import { CornerUpLeftIcon } from '@lucide/vue';
import { useQueryClient } from '@tanstack/vue-query';
import StatusSaveButton, {
  type SaveStatus,
} from '~/components/status/StatusSaveButton.vue';
import TaskAttachments from '~/features/task/components/TaskAttachments.vue';
import TaskComments from '~/features/task/components/TaskComments.vue';
import TaskDescriptionEditor from '~/features/task/components/TaskDescriptionEditor.vue';
import TaskRunHistory from '~/features/task/components/TaskRunHistory.vue';
import TaskPropertiesSidebar from '~/features/task/components/TaskPropertiesSidebar.vue';
import TaskSubtaskList from '~/features/task/components/TaskSubtaskList.vue';
import {
  useDeleteTask,
  useGetTask,
  useUpdateTask,
} from '~/features/task/composables/useTaskApi';
import { useGetTaskLabels } from '~/features/task/composables/useTaskLabelApi';
import { taskCommentKeys } from '~/features/task/composables/useTaskCommentApi';
import { taskRunKeys } from '~/features/task/composables/useTaskRunApi';
import { taskRunPollInterval } from '~/features/task/lib/task-run-display';
import { formatTaskDisplayId } from '~/features/task/lib/task-display';
import type { TaskDetailResponse } from '~/features/task/types';

definePageMeta({
  validate: (route) => hasValidTaskId(route.params),
});

const route = useRoute();
const taskId = computed(() => route.params.taskId as string);

// Refs
const title = ref('');
const isTitleDirty = ref(false);
const hasTitleSaveFailed = ref(false);
const descriptionSaveStatus = ref<SaveStatus>('saved');
const descriptionEditorRef = useTemplateRef('descriptionEditorRef');

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();

const queryClient = useQueryClient();
const workspaceId = useActiveWorkspaceId();
const { data: taskData, error: taskError } = useGetTask(taskId, {
  refetchInterval: (query: { state: { data?: TaskDetailResponse } }) =>
    taskRunPollInterval(!!query.state.data?.task.activeRun),
});
const { data: labelsData } = useGetTaskLabels();
const { mutate: updateTask } = useUpdateTask();
const { mutateAsync: deleteTask } = useDeleteTask();

// Computed
const task = computed(() => taskData.value?.task);
const titleSaveStatus = computed<SaveStatus>(() => {
  if (hasTitleSaveFailed.value) {
    return 'failed';
  }
  return isTitleDirty.value ? 'saving' : 'saved';
});
const saveStatus = computed<SaveStatus>(() => {
  const statuses = [titleSaveStatus.value, descriptionSaveStatus.value];
  if (statuses.includes('failed')) {
    return 'failed';
  }
  return statuses.includes('saving') ? 'saving' : 'saved';
});
const labels = computed(() => labelsData.value?.taskLabels ?? []);
const isLocked = computed(() => !!task.value?.activeRun);

// Reads from the `title` ref (not `task.value.title`) so the trail stays live
// with the h1 while a debounced save is still pending.
const crumbs = computed<PageCrumb[]>(() => [
  { label: t('task.list.title'), to: '/tasks' },
  {
    label: task.value
      ? `${formatTaskDisplayId(task.value.number)}: ${title.value}`
      : '',
  },
]);

watch(
  task,
  (value) => {
    if (value) {
      title.value = value.title;
    }
  },
  { immediate: true },
);

// A run that just ended posted a comment and wrote a history entry.
watch(
  () => task.value?.activeRun?.id ?? null,
  (activeRunId, previousRunId) => {
    if (activeRunId !== null || previousRunId === null) {
      return;
    }
    queryClient.invalidateQueries({
      queryKey: taskCommentKeys.list(workspaceId, taskId),
    });
    queryClient.invalidateQueries({
      queryKey: taskRunKeys.list(workspaceId, taskId),
    });
  },
);

useHead({
  title: computed(() => task.value?.title ?? t('task.detail.title')),
});

// Functions
// Same autosave contract as the description editor: keeps typing feeling
// instant while the title field never has a separate edit/view toggle.
const { start: scheduleTitleSave, stop: cancelScheduledTitleSave } =
  useTimeoutFn(saveTitle, 1000, { immediate: false });

function saveTitle() {
  cancelScheduledTitleSave();
  if (!task.value || !isTitleDirty.value) {
    return;
  }
  const savedTitle = title.value;
  updateTask(
    { taskId: task.value.id, title: savedTitle },
    {
      onSuccess: () => {
        hasTitleSaveFailed.value = false;
        if (title.value === savedTitle) {
          isTitleDirty.value = false;
        }
      },
      onError: () => {
        hasTitleSaveFailed.value = true;
      },
    },
  );
}

function saveAll() {
  saveTitle();
  descriptionEditorRef.value?.saveNow();
}

function handleTitleInput(event: Event) {
  title.value = (event.target as HTMLInputElement).value;
  isTitleDirty.value = true;
  hasTitleSaveFailed.value = false;
  scheduleTitleSave();
}

function handleTitleEnter() {
  saveTitle();
  descriptionEditorRef.value?.focus();
}

// Flushes a pending title edit immediately on navigation away instead of
// losing it to the still-pending debounce (document editor pattern).
onBeforeUnmount(() => {
  cancelScheduledTitleSave();
  if (isTitleDirty.value && task.value) {
    updateTask({ taskId: task.value.id, title: title.value });
  }
});

async function handleDelete() {
  if (!task.value) {
    return;
  }
  const confirmed = await confirm({
    title: t('task.detail.deleteConfirmTitle'),
    message: t('task.detail.deleteConfirmMessage'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteTask(task.value.id);
  await navigateTo('/tasks');
}
</script>

<template>
  <PagePanel>
    <template #header>
      <NavTopBar :crumbs="crumbs">
        <template #right>
          <StatusSaveButton v-if="task" :status="saveStatus" @save="saveAll" />
        </template>
      </NavTopBar>
    </template>
    <div v-if="task" class="flex h-full flex-col">
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <div class="min-h-0 flex-1 overflow-y-auto p-6">
          <div class="mx-auto max-w-3xl space-y-4">
            <NuxtLinkLocale
              v-if="task.parentTaskId"
              :to="`/tasks/${task.parentTaskId}`"
              class="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:underline"
            >
              <CornerUpLeftIcon class="size-3.5" />
              {{ t('task.detail.backToParent') }}
            </NuxtLinkLocale>

            <!-- The page's one semantic h1 wraps the editable input (same
               pattern as components/InlineNameField.vue), so the title
               keeps proper heading structure in the document outline while
               still behaving as a plain in-place text field. -->
            <h1 class="text-2xl font-semibold">
              <input
                :value="title"
                :readonly="isLocked"
                :placeholder="t('task.detail.titlePlaceholder')"
                :aria-label="t('task.detail.rename')"
                class="w-full truncate rounded-sm border-none bg-transparent p-0 text-2xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                @input="handleTitleInput"
                @blur="saveTitle"
                @keydown.enter.prevent="handleTitleEnter"
              />
            </h1>

            <div class="space-y-6">
              <TaskDescriptionEditor
                ref="descriptionEditorRef"
                v-model:save-status="descriptionSaveStatus"
                :task-id="task.id"
                :description="task.description"
                :readonly="isLocked"
              />

              <TaskAttachments :task-id="task.id" :readonly="isLocked" />

              <TaskSubtaskList
                v-if="!task.parentTaskId"
                :parent-task-id="task.id"
                :subtasks="task.subtasks"
              />

              <TaskRunHistory :task-id="task.id" />

              <TaskComments :task-id="task.id" />
            </div>
          </div>
        </div>

        <TaskPropertiesSidebar
          :task="task"
          :labels="labels"
          @delete="handleDelete"
        />
      </div>
    </div>
    <div v-else-if="taskError" class="flex h-full items-center justify-center">
      <p class="text-sm text-muted-foreground">
        {{ taskError.message || t('task.detail.loadError') }}
      </p>
    </div>
    <div v-else class="flex h-full items-center justify-center">
      <p class="text-sm text-muted-foreground">
        {{ t('task.detail.loading') }}
      </p>
    </div>
  </PagePanel>
</template>
