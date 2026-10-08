<script setup lang="ts">
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from '@lucide/vue';
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import {
  useCreateTaskLabel,
  useDeleteTaskLabel,
  useUpdateTaskLabel,
} from '~/features/task/composables/useTaskLabelApi';
import type { TaskLabel } from '~/features/task/types';

const DEFAULT_COLOR = '#78716c';

const createLabelSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'Must be a hex color, e.g. #4287f5.',
  }),
});

// Props
const props = defineProps<{ labels: TaskLabel[] }>();

// Refs
const open = defineModel<boolean>('open', { default: false });
const editingLabelId = ref<string | null>(null);
const editingName = ref('');
const editingColor = ref(DEFAULT_COLOR);

// Composables
const { mutateAsync: createTaskLabel, isPending: isCreating } =
  useCreateTaskLabel();
const { mutateAsync: updateTaskLabel, isPending: isRenaming } =
  useUpdateTaskLabel();
const { mutateAsync: deleteTaskLabel } = useDeleteTaskLabel();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

const createForm = useForm({
  defaultValues: { name: '', color: DEFAULT_COLOR },
  validators: { onChange: createLabelSchema },
  onSubmit: async ({ value }) => {
    await createTaskLabel(value);
    createForm.reset();
  },
});

// Functions
function startEditing(label: TaskLabel) {
  editingLabelId.value = label.id;
  editingName.value = label.name;
  editingColor.value = label.color;
}

function cancelEditing() {
  editingLabelId.value = null;
  editingName.value = '';
}

async function saveEditing() {
  const taskLabelId = editingLabelId.value;
  const name = editingName.value.trim();
  if (!taskLabelId || !name) {
    return;
  }
  await updateTaskLabel({ taskLabelId, name, color: editingColor.value });
  cancelEditing();
}

async function handleDelete(label: TaskLabel) {
  const confirmed = await confirm({
    title: t('task.label.deleteTitle'),
    message: t('task.label.deleteMessage', { name: label.name }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteTaskLabel(label.id);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('task.label.manageTitle') }}</DialogTitle>
        <DialogDescription>{{
          t('task.label.manageDescription')
        }}</DialogDescription>
      </DialogHeader>

      <form
        class="flex items-start gap-2"
        @submit.prevent.stop="createForm.handleSubmit"
      >
        <createForm.Field name="color">
          <template v-slot="{ field, state }">
            <input
              :id="field.name"
              type="color"
              class="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-input"
              :value="state.value"
              :aria-label="t('task.label.colorLabel')"
              @input="
                (e) => field.handleChange((e.target as HTMLInputElement).value)
              "
            />
          </template>
        </createForm.Field>
        <createForm.Field name="name">
          <template v-slot="{ field, state }">
            <div class="flex-1">
              <Input
                :id="field.name"
                :model-value="state.value"
                :placeholder="t('task.label.namePlaceholder')"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </createForm.Field>
        <Button type="submit" size="icon" :disabled="isCreating">
          <Spinner v-if="isCreating" />
          <PlusIcon v-else class="size-4" />
        </Button>
      </form>

      <Separator v-if="props.labels.length > 0" />

      <ul
        v-if="props.labels.length > 0"
        class="max-h-64 space-y-1 overflow-y-auto"
      >
        <li
          v-for="label in props.labels"
          :key="label.id"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-stone-50"
        >
          <template v-if="editingLabelId === label.id">
            <input
              v-model="editingColor"
              type="color"
              class="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input"
              :aria-label="t('task.label.colorLabel')"
            />
            <Input
              v-model="editingName"
              autocomplete="off"
              class="h-8 flex-1"
              @keyup.enter="saveEditing"
              @keyup.esc="cancelEditing"
            />
            <Button
              variant="ghost"
              size="icon"
              :disabled="isRenaming"
              :aria-label="t('common.saveRename')"
              @click="saveEditing"
            >
              <Spinner v-if="isRenaming" />
              <CheckIcon v-else class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('common.cancelRename')"
              @click="cancelEditing"
            >
              <XIcon class="size-4" />
            </Button>
          </template>
          <template v-else>
            <span
              class="size-4 shrink-0 rounded-full"
              :style="{ backgroundColor: label.color }"
            />
            <span class="flex-1 truncate text-sm">{{ label.name }}</span>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('task.label.rename')"
              @click="startEditing(label)"
            >
              <PencilIcon class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('task.label.delete')"
              @click="handleDelete(label)"
            >
              <Trash2Icon class="size-4 text-destructive" />
            </Button>
          </template>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">
        {{ t('task.label.empty') }}
      </p>

      <DialogFooter>
        <Button variant="secondary" @click="open = false">
          {{ t('common.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
