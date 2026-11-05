<script setup lang="ts">
import { CodeXmlIcon, TypeIcon } from '@lucide/vue';
import type { HTMLAttributes } from 'vue';
import ViewSwitcher, { type ViewOption } from '~/components/ViewSwitcher.vue';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';
import RichTextEditor from './RichTextEditor.vue';
import { useRichTextEditor } from './useRichTextEditor';

export type MarkdownFieldView = 'formatted' | 'raw';

export interface MarkdownEditorFieldProps {
  profile?: 'document' | 'prompt';
  placeholder?: string;
  invalid?: boolean;
  /** Shows the character count. No count without it. */
  maxLength?: number;
  class?: HTMLAttributes['class'];
  ariaLabelledby?: string;
}

const MARKDOWN_FIELD_VIEWS: readonly ViewOption<MarkdownFieldView>[] = [
  { value: 'formatted', labelKey: 'editor.view.formatted', icon: TypeIcon },
  { value: 'raw', labelKey: 'editor.view.raw', icon: CodeXmlIcon },
];

// Props
const props = withDefaults(defineProps<MarkdownEditorFieldProps>(), {
  profile: 'prompt',
});

// Emits
const emit = defineEmits<{ blur: [] }>();

// Refs
const model = defineModel<string>({ required: true });
const view = useLocalStorage<MarkdownFieldView>(
  'markdown-field:view',
  'formatted',
);
let lastEmittedValue = model.value;

// Composables
const { n, t } = useI18n();
const controller = useRichTextEditor({
  content: model.value,
  profile: props.profile,
  placeholder: props.placeholder,
  attributes: props.ariaLabelledby
    ? { 'aria-labelledby': props.ariaLabelledby }
    : undefined,
  onUpdate: (markdown) => {
    lastEmittedValue = markdown;
    model.value = markdown;
  },
});

// Computed
const isOverLimit = computed(
  () => props.maxLength !== undefined && model.value.length > props.maxLength,
);

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

function updateFromRaw(value: string | number) {
  model.value = String(value);
}

// Hooks
watch([model, controller.editor], ([value, editor]) => {
  if (!editor || value === lastEmittedValue) {
    return;
  }
  lastEmittedValue = value;
  controller.setContent(value);
});
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
      <ViewSwitcher v-model="view" :options="MARKDOWN_FIELD_VIEWS" />
    </div>
    <div
      :aria-invalid="invalid || undefined"
      :class="
        cn(
          'flex min-h-0 flex-col overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
          props.class,
        )
      "
    >
      <RichTextEditor
        v-show="view === 'formatted'"
        :controller="controller"
        class="document-sheet-compact flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2 text-base md:text-sm"
      />
      <Textarea
        v-show="view === 'raw'"
        :model-value="model"
        :aria-labelledby="ariaLabelledby"
        :aria-invalid="invalid || undefined"
        class="min-h-0 flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        @update:model-value="updateFromRaw"
      />
    </div>
    <p
      v-if="maxLength !== undefined"
      :class="
        cn(
          'text-right text-xs text-muted-foreground',
          isOverLimit && 'text-destructive',
        )
      "
    >
      {{ t('editor.charCount', { count: n(model.length), max: n(maxLength) }) }}
    </p>
  </div>
</template>
