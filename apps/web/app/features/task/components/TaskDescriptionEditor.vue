<script setup lang="ts">
import type { SaveStatus } from '~/components/SaveStatusButton.vue';
import RichTextEditor from '~/components/editor/RichTextEditor.vue';
import { useRichTextEditor } from '~/components/editor/useRichTextEditor';
import { useUpdateTask } from '~/features/task/composables/useTaskApi';

const AUTOSAVE_DELAY_MS = 1000;

// Props
const props = defineProps<{ taskId: string; description: string }>();

// Models
const saveStatus = defineModel<SaveStatus>('saveStatus', { default: 'saved' });

// Refs
const latestContent = ref(props.description);
const isDirty = ref(false);
const hasSaveFailed = ref(false);

// Composables
const { t } = useI18n();
const { mutate: saveTask } = useUpdateTask();

const { start: scheduleSave, stop: cancelScheduledSave } = useTimeoutFn(
  saveNow,
  AUTOSAVE_DELAY_MS,
  { immediate: false },
);

const controller = useRichTextEditor({
  content: props.description,
  profile: 'document',
  placeholder: t('task.detail.descriptionPlaceholder'),
  onUpdate: (markdown) => {
    latestContent.value = markdown;
    isDirty.value = true;
    hasSaveFailed.value = false;
    scheduleSave();
  },
});

watchEffect(() => {
  if (hasSaveFailed.value) {
    saveStatus.value = 'failed';
  } else {
    saveStatus.value = isDirty.value ? 'saving' : 'saved';
  }
});

// Functions
function saveNow() {
  cancelScheduledSave();
  if (!isDirty.value) {
    return;
  }
  const description = latestContent.value;
  saveTask(
    { taskId: props.taskId, description },
    {
      onSuccess: () => {
        hasSaveFailed.value = false;
        if (latestContent.value === description) {
          isDirty.value = false;
        }
      },
      onError: () => {
        hasSaveFailed.value = true;
      },
    },
  );
}

// Hooks
// Flushes a pending edit immediately on navigation away instead of losing
// it to the still-pending debounce.
onBeforeUnmount(() => {
  cancelScheduledSave();
  if (isDirty.value) {
    saveTask({ taskId: props.taskId, description: latestContent.value });
  }
});

// Lets the page's title field move focus here when the user presses Enter.
defineExpose({ focus: controller.focusEnd, saveNow });
</script>

<template>
  <RichTextEditor
    :controller="controller"
    class="flex min-h-80 flex-col rounded-md border-0 bg-background px-0 pt-1 pb-5"
  />
</template>
