<script setup lang="ts">
import { Button } from '~/components/ui/button';
import RichTextEditor from '~/components/editor/RichTextEditor.vue';
import { useRichTextEditor } from '~/components/editor/useRichTextEditor';

const MAX_COMMENT_LENGTH = 10_000;

// Props
interface Props {
  initialBody?: string;
  submitLabel: string;
  isPending?: boolean;
  isCancellable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  initialBody: '',
  isPending: false,
  isCancellable: false,
});

// Emits
const emit = defineEmits<{
  submit: [body: string];
  cancel: [];
}>();

// Refs
const draft = ref(props.initialBody);

// Composables
const { t } = useI18n();
const controller = useRichTextEditor({
  content: props.initialBody,
  profile: 'document',
  placeholder: t('task.comment.placeholder'),
  onUpdate: (markdown) => {
    draft.value = markdown;
  },
});

// Computed
const trimmedDraft = computed(() => draft.value.trim());
const canSubmit = computed(
  () =>
    !props.isPending &&
    trimmedDraft.value.length > 0 &&
    trimmedDraft.value.length <= MAX_COMMENT_LENGTH,
);

// Functions
function submit() {
  if (!canSubmit.value) {
    return;
  }
  emit('submit', trimmedDraft.value);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <RichTextEditor
      :controller="controller"
      class="flex min-h-20 flex-col rounded-md border bg-background px-3 py-2"
    />
    <div class="flex justify-end gap-2">
      <Button
        v-if="isCancellable"
        type="button"
        variant="ghost"
        size="sm"
        @click="emit('cancel')"
      >
        {{ t('common.cancel') }}
      </Button>
      <Button type="button" size="sm" :disabled="!canSubmit" @click="submit">
        {{ submitLabel }}
      </Button>
    </div>
  </div>
</template>
