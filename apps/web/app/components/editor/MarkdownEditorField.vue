<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import MarkdownEditorBox, {
  type MarkdownEditorBoxProps,
} from './MarkdownEditorBox.vue';
import MarkdownEditorPanel from './MarkdownEditorPanel.vue';
import {
  MARKDOWN_FIELD_VIEWS,
  useMarkdownFieldView,
} from './markdown-field-view';

export interface MarkdownEditorFieldProps extends Pick<
  MarkdownEditorBoxProps,
  'profile' | 'placeholder' | 'invalid' | 'maxLength' | 'ariaLabelledby'
> {
  /** Names the expanded side panel. Without it the field has no expand button. */
  panelTitle?: string;
  class?: HTMLAttributes['class'];
}

// Props
const props = defineProps<MarkdownEditorFieldProps>();

// Emits
const emit = defineEmits<{ blur: [] }>();

// Refs
const model = defineModel<string>({ required: true });
const isExpanded = ref(false);
const view = useMarkdownFieldView();

// Functions
function emitBlurWhenFocusLeavesField(event: FocusEvent) {
  const field = event.currentTarget;
  const next = event.relatedTarget;
  const stillInside =
    field instanceof Node && next instanceof Node && field.contains(next);
  if (!stillInside) {
    emit('blur');
  }
}
</script>

<template>
  <div
    class="flex min-h-0 flex-col gap-2"
    @focusout="emitBlurWhenFocusLeavesField"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <slot name="label" />
      </div>
      <ViewSwitcher v-model="view" :options="MARKDOWN_FIELD_VIEWS" size="sm" />
    </div>
    <MarkdownEditorBox
      v-model="model"
      :view="view"
      :profile="profile"
      :placeholder="placeholder"
      :invalid="invalid"
      :max-length="maxLength"
      :aria-labelledby="ariaLabelledby"
      :show-expand="props.panelTitle !== undefined"
      :class="props.class"
      @expand="isExpanded = true"
    />
    <MarkdownEditorPanel
      v-if="props.panelTitle !== undefined"
      v-model="model"
      v-model:open="isExpanded"
      :title="props.panelTitle"
      :profile="profile"
      :placeholder="placeholder"
      :invalid="invalid"
      :max-length="maxLength"
    />
  </div>
</template>
