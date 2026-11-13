<script setup lang="ts">
import { AGENT_MARK_TONES, type AgentMarkTone } from '@repo/ai/client';
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import TaskLabelToneTrigger from '~/features/task/components/TaskLabelToneTrigger.vue';
import {
  useCreateTaskLabel,
  useDeleteTaskLabel,
  useUpdateTaskLabel,
} from '~/features/task/composables/useTaskLabelApi';
import {
  firstUnusedTone,
  LABEL_TONE_HEX,
  labelTone,
} from '~/features/task/lib/label-tone';
import type { TaskLabel } from '~/features/task/types';
import { TONE_DOT_CLASS } from '~/lib/tone';
import { cn } from '~/lib/utils';

interface TaskLabelManageDialogProps {
  labels: TaskLabel[];
}

// Props
const props = defineProps<TaskLabelManageDialogProps>();

// Refs
const open = defineModel<boolean>('open', { default: false });
const editingLabelId = ref<string | null>(null);
const editingName = ref('');
const editingTone = ref<AgentMarkTone>('sea');
const nameInput = useTemplateRef('nameInput');
const editInputs = useTemplateRef('editInput');

// Composables
const { mutateAsync: createTaskLabel, isPending: isCreating } =
  useCreateTaskLabel();
const { mutateAsync: updateTaskLabel, isPending: isRenaming } =
  useUpdateTaskLabel();
const { mutateAsync: deleteTaskLabel } = useDeleteTaskLabel();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

// Computed
const usedTones = computed(() => props.labels.map((label) => labelTone(label)));

const createLabelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: t('common.nameRequired') }),
  tone: z.enum(AGENT_MARK_TONES),
});

const createForm = useForm({
  defaultValues: {
    name: '',
    tone: firstUnusedTone(usedTones.value),
  },
  validators: { onChange: createLabelSchema },
  onSubmit: async ({ value }) => {
    const name = value.name.trim();
    await createTaskLabel({ name, color: LABEL_TONE_HEX[value.tone] });
    createForm.reset();
    createForm.setFieldValue(
      'tone',
      firstUnusedTone([...usedTones.value, value.tone]),
    );
  },
});
const hasName = createForm.useStore((state) => state.values.name.trim() !== '');

// Functions
function focusInput(input: { $el: unknown } | null | undefined) {
  if (input?.$el instanceof HTMLElement) {
    input.$el.focus();
  }
}

// The colour trigger comes first in the DOM; focusing it would open its tooltip.
function focusNameOnOpen(event: Event) {
  event.preventDefault();
  focusInput(nameInput.value);
}

async function startEditing(label: TaskLabel) {
  editingLabelId.value = label.id;
  editingName.value = label.name;
  editingTone.value = labelTone(label);
  await nextTick();
  focusInput(editInputs.value?.[0]);
}

function cancelEditing() {
  editingLabelId.value = null;
  editingName.value = '';
}

async function saveEditing(label: TaskLabel) {
  const name = editingName.value.trim();
  if (!name || isRenaming.value) {
    return;
  }
  // Recolour only on a tone change: an older hex stays until then.
  const toneChanged = editingTone.value !== labelTone(label);
  await updateTaskLabel({
    taskLabelId: label.id,
    name,
    ...(toneChanged && { color: LABEL_TONE_HEX[editingTone.value] }),
  });
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

// Hooks
watch(open, (isOpen) => {
  if (!isOpen) {
    cancelEditing();
  }
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent @open-auto-focus="focusNameOnOpen">
      <DialogHeader>
        <DialogTitle>{{ t('task.label.manageTitle') }}</DialogTitle>
        <DialogDescription>{{
          t('task.label.manageDescription')
        }}</DialogDescription>
      </DialogHeader>

      <form
        class="flex items-center gap-2"
        @submit.prevent.stop="createForm.handleSubmit"
      >
        <createForm.Field name="tone">
          <template v-slot="{ field, state }">
            <TaskLabelToneTrigger
              :model-value="state.value"
              @update:model-value="field.handleChange"
            />
          </template>
        </createForm.Field>
        <createForm.Field name="name">
          <template v-slot="{ field, state }">
            <Input
              :id="field.name"
              ref="nameInput"
              :model-value="state.value"
              :placeholder="t('task.label.namePlaceholder')"
              :aria-label="t('task.label.namePlaceholder')"
              autocomplete="off"
              class="flex-1"
              @update:model-value="(v) => field.handleChange(String(v))"
              @blur="field.handleBlur"
            />
          </template>
        </createForm.Field>
        <Button type="submit" :disabled="!hasName || isCreating">
          {{ t('task.label.add') }}
        </Button>
      </form>

      <Separator class="my-4" />

      <ul v-if="props.labels.length > 0" class="max-h-64 overflow-y-auto">
        <li
          v-for="label in props.labels"
          :key="label.id"
          class="group flex h-9 items-center rounded-md hover:bg-surface-subtle"
        >
          <form
            v-if="editingLabelId === label.id"
            class="flex w-full items-center gap-2"
            @submit.prevent="saveEditing(label)"
            @keydown.esc.stop.prevent="cancelEditing"
          >
            <TaskLabelToneTrigger v-model="editingTone" />
            <Input
              ref="editInput"
              v-model="editingName"
              autocomplete="off"
              :aria-label="t('task.label.namePlaceholder')"
              class="flex-1"
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              class="text-icon"
              :disabled="isRenaming"
              :aria-label="t('common.save')"
            >
              <Icon name="hugeicons:tick-02" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="text-icon"
              :aria-label="t('common.cancel')"
              @click="cancelEditing"
            >
              <Icon name="hugeicons:cancel-01" />
            </Button>
          </form>
          <template v-else>
            <span class="flex w-8 shrink-0 items-center justify-center">
              <span
                :class="
                  cn('size-2 rounded-full', TONE_DOT_CLASS[labelTone(label)])
                "
                aria-hidden="true"
              />
            </span>
            <span class="ml-2 flex-1 truncate text-body">{{ label.name }}</span>
            <div
              class="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-icon"
                :aria-label="t('task.label.rename')"
                @click="startEditing(label)"
              >
                <Icon name="hugeicons:pencil-edit-02" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-icon"
                :aria-label="t('task.label.delete')"
                @click="handleDelete(label)"
              >
                <Icon name="hugeicons:delete-02" />
              </Button>
            </div>
          </template>
        </li>
      </ul>
      <p v-else class="text-small text-muted-foreground">
        {{ t('task.label.empty') }}
      </p>
    </DialogContent>
  </Dialog>
</template>
