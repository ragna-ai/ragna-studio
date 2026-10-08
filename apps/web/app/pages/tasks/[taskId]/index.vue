<script setup lang="ts">
import { CornerUpLeftIcon } from '@lucide/vue';
import TaskAttachments from '~/features/task/components/TaskAttachments.vue';
import TaskDescriptionEditor from '~/features/task/components/TaskDescriptionEditor.vue';
import TaskPropertiesSidebar from '~/features/task/components/TaskPropertiesSidebar.vue';
import TaskSubtaskList from '~/features/task/components/TaskSubtaskList.vue';
import {
  useDeleteTask,
  useGetTask,
  useUpdateTask,
} from '~/features/task/composables/useTaskApi';
import { useGetTaskLabels } from '~/features/task/composables/useTaskLabelApi';
import { formatTaskDisplayId } from '~/features/task/lib/task-display';

definePageMeta({
  validate: (route) => hasValidTaskId(route.params),
});

const route = useRoute();
const taskId = computed(() => route.params.taskId as string);

// Refs
const title = ref('');
const isTitleDirty = ref(false);
const descriptionEditorRef = useTemplateRef('descriptionEditorRef');

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();

const { data: taskData, error: taskError } = useGetTask(taskId);
const { data: labelsData } = useGetTaskLabels();
const { mutate: updateTask } = useUpdateTask();
const { mutateAsync: deleteTask } = useDeleteTask();

// Computed
const task = computed(() => taskData.value?.task);
const labels = computed(() => labelsData.value?.taskLabels ?? []);

// The title field is a page-owned h1 (specs/tasks/prd.md, task detail page),
// not the breadcrumb's current item; the breadcrumb's last item is a
// read-only "TSK-<n>: <title>" label instead. It reads from the `title` ref
// (not `task.value.title`) so it stays live with the h1 while a debounced
// save is still pending, not just after the next refetch. Long titles are
// truncated by PageBreadcrumb's own CSS (`max-w-lg truncate` on the last
// item), the same mechanism the document editor's breadcrumb relies on.
const ancestorItems = computed(() => [
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

useHead({
  title: computed(() => task.value?.title ?? t('task.detail.title')),
});

// Functions
// Same debounced/blur autosave contract as the description editor: keeps
// typing feeling instant while the title field never has a separate
// edit/view toggle to invoke first.
const debouncedSaveTitle = useDebounceFn(() => {
  if (!task.value) {
    return;
  }
  updateTask(
    { taskId: task.value.id, title: title.value },
    { onSuccess: () => (isTitleDirty.value = false) },
  );
}, 1000);

function handleTitleInput(event: Event) {
  title.value = (event.target as HTMLInputElement).value;
  isTitleDirty.value = true;
  debouncedSaveTitle();
}

function commitTitleNow() {
  if (!task.value || !isTitleDirty.value) {
    return;
  }
  updateTask(
    { taskId: task.value.id, title: title.value },
    { onSuccess: () => (isTitleDirty.value = false) },
  );
}

function handleTitleEnter() {
  commitTitleNow();
  descriptionEditorRef.value?.focus();
}

// Flushes a pending title edit immediately on navigation away instead of
// losing it to the still-pending debounce (document editor pattern).
onBeforeUnmount(() => {
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
  <div v-if="task" class="flex h-full flex-col">
    <header class="flex items-center border-b p-4">
      <PageBreadcrumb :items="ancestorItems" />
    </header>

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
          <h1 class="text-3xl font-semibold">
            <input
              :value="title"
              :placeholder="t('task.detail.titlePlaceholder')"
              :aria-label="t('task.detail.rename')"
              class="w-full truncate rounded-sm border-none bg-transparent p-0 text-3xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              @input="handleTitleInput"
              @blur="commitTitleNow"
              @keydown.enter.prevent="handleTitleEnter"
            />
          </h1>

          <div class="space-y-6 pt-2">
            <TaskDescriptionEditor
              ref="descriptionEditorRef"
              :task-id="task.id"
              :description="task.description"
            />

            <TaskAttachments :task-id="task.id" />

            <TaskSubtaskList
              v-if="!task.parentTaskId"
              :parent-task-id="task.id"
              :subtasks="task.subtasks"
            />
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
    <p class="text-sm text-stone-500">
      {{ taskError.message || t('task.detail.loadError') }}
    </p>
  </div>
  <div v-else class="flex h-full items-center justify-center">
    <p class="text-sm text-stone-500">{{ t('task.detail.loading') }}</p>
  </div>
</template>
