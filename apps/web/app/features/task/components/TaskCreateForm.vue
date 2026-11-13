<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import RichTextEditor from '~/components/editor/RichTextEditor.vue';
import { useRichTextEditor } from '~/components/editor/useRichTextEditor';
import { Input } from '~/components/ui/input';
import TaskAssigneePicker from '~/features/task/components/TaskAssigneePicker.vue';
import TaskDueDatePicker from '~/features/task/components/TaskDueDatePicker.vue';
import TaskLabelsPicker from '~/features/task/components/TaskLabelsPicker.vue';
import TaskOptionMenu from '~/features/task/components/TaskOptionMenu.vue';
import { useCreateTask } from '~/features/task/composables/useTaskApi';
import {
  PRIORITY_OPTIONS,
  STATUS_COLUMNS,
} from '~/features/task/lib/task-display';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type CreateTaskRequest,
  type TaskPriority,
  type TaskStatus,
} from '~/features/task/types';

interface TaskCreateFormProps {
  status: TaskStatus;
}

interface TaskCreateFormValues {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgentId: string | null;
  labelIds: string[];
  dueDate: string | null;
}

// Props
const props = defineProps<TaskCreateFormProps>();

// Emits
const emit = defineEmits<{
  created: [];
  'manage-labels': [];
}>();

// Refs
const isCreateMore = ref(false);
const titleInput = useTemplateRef('titleInput');

// Composables
const { t } = useI18n();
const { mutateAsync: createTask, isPending } = useCreateTask();

const description = useRichTextEditor({
  content: '',
  profile: 'document',
  placeholder: t('task.detail.descriptionPlaceholder'),
});

const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: t('common.titleRequired') }),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  assignedAgentId: z.string().nullable(),
  labelIds: z.array(z.string()),
  dueDate: z.string().nullable(),
});

const defaultValues: TaskCreateFormValues = {
  title: '',
  status: props.status,
  priority: 'none',
  assignedAgentId: null,
  labelIds: [],
  dueDate: null,
};

const form = useForm({
  defaultValues,
  validators: { onChange: createTaskSchema },
  onSubmit: async ({ value }) => {
    await createTask(buildRequest(value, description.getContent().trim()));
    if (!isCreateMore.value) {
      emit('created');
      return;
    }
    form.setFieldValue('title', '');
    description.setContent('');
    focusTitle();
  },
});
const hasTitle = form.useStore((state) => state.values.title.trim() !== '');

// Functions
function buildRequest(
  values: TaskCreateFormValues,
  descriptionMarkdown: string,
): CreateTaskRequest {
  const request: CreateTaskRequest = {
    title: values.title.trim(),
    status: values.status,
    priority: values.priority,
  };
  if (descriptionMarkdown) {
    request.description = descriptionMarkdown;
  }
  if (values.assignedAgentId) {
    request.assignedAgentId = values.assignedAgentId;
  }
  if (values.labelIds.length > 0) {
    request.labelIds = values.labelIds;
  }
  if (values.dueDate) {
    request.dueDate = values.dueDate;
  }
  return request;
}

function focusTitle() {
  const element = titleInput.value?.$el;
  if (element instanceof HTMLElement) {
    element.focus();
  }
}

function onTitleEnter(event: KeyboardEvent) {
  if (event.isComposing) {
    return;
  }
  event.preventDefault();
  description.focusEnd();
}

// Capture phase: ProseMirror binds Mod-Enter to a hard break, so the
// shortcut has to be taken before it reaches the editor.
function onSubmitShortcut(event: KeyboardEvent) {
  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (hasTitle.value && !isPending.value) {
    form.handleSubmit();
  }
}
</script>

<template>
  <form
    class="flex flex-col"
    @keydown.capture="onSubmitShortcut"
    @submit.prevent.stop="form.handleSubmit"
  >
    <form.Field name="title">
      <template v-slot="{ field, state }">
        <Input
          :id="field.name"
          ref="titleInput"
          autofocus
          autocomplete="off"
          :aria-label="t('common.title')"
          :model-value="state.value"
          :placeholder="t('task.createDialog.titlePlaceholder')"
          class="mt-2 h-auto border-0 bg-transparent px-0 py-0 text-title font-semibold shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
          @update:model-value="(v) => field.handleChange(String(v))"
          @blur="field.handleBlur"
          @keydown.enter="onTitleEnter"
        />
      </template>
    </form.Field>

    <RichTextEditor
      :controller="description"
      class="mt-2 flex max-h-60 min-h-15 flex-col overflow-y-auto rounded-md border-0 bg-transparent px-0"
    />

    <div class="mt-4 flex flex-wrap gap-1.5">
      <form.Field name="status">
        <template v-slot="{ field, state }">
          <TaskOptionMenu
            :model-value="state.value"
            :options="STATUS_COLUMNS"
            @update:model-value="field.handleChange"
          />
        </template>
      </form.Field>
      <form.Field name="priority">
        <template v-slot="{ field, state }">
          <TaskOptionMenu
            :model-value="state.value"
            :options="PRIORITY_OPTIONS"
            empty-value="none"
            :placeholder="t('task.property.priority')"
            @update:model-value="field.handleChange"
          />
        </template>
      </form.Field>
      <form.Field name="assignedAgentId">
        <template v-slot="{ field, state }">
          <TaskAssigneePicker
            :model-value="state.value"
            @update:model-value="field.handleChange"
          />
        </template>
      </form.Field>
      <form.Field name="labelIds">
        <template v-slot="{ field, state }">
          <TaskLabelsPicker
            :model-value="state.value"
            @update:model-value="field.handleChange"
            @manage-labels="emit('manage-labels')"
          />
        </template>
      </form.Field>
      <form.Field name="dueDate">
        <template v-slot="{ field, state }">
          <TaskDueDatePicker
            :model-value="state.value"
            @update:model-value="field.handleChange"
          />
        </template>
      </form.Field>
    </div>

    <div
      class="-mx-6 mt-6 flex items-center justify-end gap-3 border-t px-6 pt-4"
    >
      <label class="flex items-center gap-2 text-small">
        <Switch v-model="isCreateMore" />
        {{ t('task.createDialog.createMore') }}
      </label>
      <Button
        type="submit"
        :disabled="!hasTitle || isPending"
        :loading="isPending"
      >
        {{ t('task.createDialog.create') }}
      </Button>
    </div>
  </form>
</template>
