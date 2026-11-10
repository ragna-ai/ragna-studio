<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';
import type { MarkdownFieldView } from './markdown-field-view';
import RichTextEditor from './RichTextEditor.vue';
import { useRichTextEditor } from './useRichTextEditor';

export interface MarkdownEditorBoxProps {
  view: MarkdownFieldView;
  profile?: 'document' | 'prompt';
  placeholder?: string;
  invalid?: boolean;
  /** Shows the character count. No count without it. */
  maxLength?: number;
  showExpand?: boolean;
  class?: HTMLAttributes['class'];
  rootClass?: HTMLAttributes['class'];
  ariaLabelledby?: string;
  ariaLabel?: string;
}

// Props
const props = withDefaults(defineProps<MarkdownEditorBoxProps>(), {
  profile: 'prompt',
});

// Emits
const emit = defineEmits<{ expand: []; escape: [] }>();

// Refs
const model = defineModel<string>({ required: true });
let lastEmittedValue = model.value;

// Composables
const { n, t } = useI18n();
const controller = useRichTextEditor({
  content: model.value,
  profile: props.profile,
  placeholder: props.placeholder,
  attributes: editorAttributes(),
  onUpdate: (markdown) => {
    lastEmittedValue = markdown;
    model.value = markdown;
  },
});

// Computed
const scrollerBottomPadding = computed(() =>
  props.showExpand ? 'pb-8' : 'pb-2',
);
const isOverLimit = computed(
  () => props.maxLength !== undefined && model.value.length > props.maxLength,
);

// Functions
// ProseMirror prevents every Escape, so the enclosing layer never sees it; this one is seen first.
function emitEscapeUnlessPopupOpen() {
  const popupOpen =
    controller.slashMenu.value !== null ||
    controller.isLinkFormOpen.value ||
    controller.isImageFormOpen.value;
  if (!popupOpen) {
    emit('escape');
  }
}

function editorAttributes(): Record<string, string> | undefined {
  if (props.ariaLabelledby) {
    return { 'aria-labelledby': props.ariaLabelledby };
  }
  return props.ariaLabel ? { 'aria-label': props.ariaLabel } : undefined;
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
    :class="cn('flex min-h-0 flex-1 flex-col gap-2', rootClass)"
    @keydown.esc.capture="emitEscapeUnlessPopupOpen"
  >
    <div
      :aria-invalid="invalid || undefined"
      :class="
        cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-input bg-transparent pt-2 pr-2 pl-3 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
          props.class,
        )
      "
    >
      <RichTextEditor
        v-show="view === 'formatted'"
        :controller="controller"
        :class="
          cn(
            'document-sheet-compact flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 text-base md:text-sm',
            scrollerBottomPadding,
          )
        "
      />
      <Textarea
        v-show="view === 'raw'"
        :model-value="model"
        :aria-labelledby="ariaLabelledby"
        :aria-label="ariaLabel"
        :aria-invalid="invalid || undefined"
        :class="
          cn(
            'min-h-0 flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent p-0 pr-1 font-mono text-mono shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-mono dark:bg-transparent',
            scrollerBottomPadding,
          )
        "
        @update:model-value="updateFromRaw"
      />
      <TooltipProvider v-if="showExpand">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="outline"
              type="button"
              size="icon-xs"
              class="absolute right-2 bottom-2 text-icon"
              :aria-label="t('editor.field.expand')"
              @click="emit('expand')"
            >
              <Icon name="hugeicons:arrow-expand-01" class="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t('editor.field.expand') }}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
