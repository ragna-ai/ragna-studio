<script setup lang="ts">
import { SaveCheckIcon, SavePenIcon } from '@lucide/vue';
import { EditorContent, focusEnd } from '@repo/editor';
import EditorMenu from '~/features/document/components/EditorMenu.vue';
import { useUpdateTask } from '~/features/task/composables/useTaskApi';
import { useTaskDescriptionEditor } from '~/features/task/composables/useTaskDescriptionEditor';

// Markdown description editor for the task detail page's main column: same
// parse-on-load/serialize-on-save/debounced-autosave contract as
// features/document/components/DocumentEditor.vue, reusing its EditorMenu
// toolbar and typography (document-sheet class, DocumentEditor.css) since
// both features edit the same markdown shape.

// Props
const props = defineProps<{ taskId: string; description: string }>();

// Refs
const latestContent = ref(props.description);
const isDirty = ref(false);

// Composables
const { t } = useI18n();
const { mutate: saveTask } = useUpdateTask();

const controller = useTaskDescriptionEditor({
  content: props.description,
  placeholder: t('task.detail.descriptionPlaceholder'),
  onUpdate: (markdown) => {
    latestContent.value = markdown;
    isDirty.value = true;
    debouncedSave();
  },
});
const editor = controller.editor;

// Computed
const saveStatus = computed<'saved' | 'saving'>(() =>
  isDirty.value ? 'saving' : 'saved',
);

// Functions
const debouncedSave = useDebounceFn(() => {
  saveTask(
    { taskId: props.taskId, description: latestContent.value },
    { onSuccess: () => (isDirty.value = false) },
  );
}, 1000);

function focusEditorEnd() {
  if (editor.value) {
    focusEnd(editor.value);
  }
}

// Flushes a pending edit immediately on navigation away instead of losing
// it to the still-pending debounce (document editor pattern).
onBeforeUnmount(() => {
  if (isDirty.value) {
    saveTask({ taskId: props.taskId, description: latestContent.value });
  }
});

// Lets the title field (page-level, above this component) move focus here
// when the user presses Enter, without the page reaching into @repo/editor
// itself.
defineExpose({ focus: focusEditorEnd });
</script>

<template>
  <div class="flex flex-col">
    <div class="flex items-center justify-between">
      <EditorMenu :controller="controller" class="px-0 py-0" />
      <div class="text-muted-foreground">
        <SavePenIcon v-if="saveStatus === 'saving'" class="size-4 stroke-1.5" />
        <SaveCheckIcon v-else class="size-4 stroke-1.5" />
      </div>
    </div>
    <div
      class="document-sheet min-h-80 cursor-text rounded-md border-0 bg-white px-0 py-5"
      @mousedown.self.prevent="focusEditorEnd"
    >
      <EditorContent :editor="editor" class="flex flex-1 flex-col" />
    </div>
  </div>
</template>

<style src="~/features/document/components/DocumentEditor.css"></style>
