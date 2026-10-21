<script setup lang="ts">
import RichTextEditor from '~/components/editor/RichTextEditor.vue';
import { useRichTextEditor } from '~/components/editor/useRichTextEditor';
import { useUpdateTask } from '~/features/task/composables/useTaskApi';

// Props
const props = defineProps<{ taskId: string; description: string }>();

// Models
const saveStatus = defineModel<'saved' | 'saving'>('saveStatus', {
  default: 'saved',
});

// Refs
const latestContent = ref(props.description);
const isDirty = ref(false);

// Composables
const { t } = useI18n();
const { mutate: saveTask } = useUpdateTask();

const controller = useRichTextEditor({
  content: props.description,
  contentType: 'markdown',
  placeholder: t('task.detail.descriptionPlaceholder'),
  onUpdate: (markdown) => {
    latestContent.value = markdown;
    isDirty.value = true;
    debouncedSave();
  },
});

watch(isDirty, (dirty) => {
  saveStatus.value = dirty ? 'saving' : 'saved';
});

// Functions
const debouncedSave = useDebounceFn(() => {
  saveTask(
    { taskId: props.taskId, description: latestContent.value },
    { onSuccess: () => (isDirty.value = false) },
  );
}, 1000);

// Hooks
// Flushes a pending edit immediately on navigation away instead of losing
// it to the still-pending debounce.
onBeforeUnmount(() => {
  if (isDirty.value) {
    saveTask({ taskId: props.taskId, description: latestContent.value });
  }
});

// Lets the page's title field move focus here when the user presses Enter.
defineExpose({ focus: controller.focusEnd });
</script>

<template>
  <RichTextEditor
    :controller="controller"
    class="flex min-h-80 flex-col rounded-md border-0 bg-white px-0 pt-1 pb-5"
  />
</template>
