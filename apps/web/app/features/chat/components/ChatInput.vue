<script setup lang="ts">
// Imports
import { PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { PaperclipIcon } from '@lucide/vue';
import type { ChatStatus } from 'ai';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import ChatPendingAttachment from '~/features/chat/components/ChatPendingAttachment.vue';
import type { PendingAttachment } from '~/features/chat/composables/useChatAttachments';
import { CHAT_ATTACHMENT_ACCEPT } from '~/features/chat/lib/attachment-mime';

// Props
interface Props {
  items: PendingAttachment[];
  status: ChatStatus;
  isBusy: boolean;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  submit: [text: string];
  stop: [];
  files: [files: File[]];
  retry: [id: string];
  remove: [id: string];
}>();

// Refs
const text = defineModel<string>({ required: true });
const containerRef = useTemplateRef<HTMLDivElement>('containerRef');

// Composables
const { t } = useI18n();
const { open: openFilePicker, onChange: onFilesPicked } = useFileDialog({
  multiple: true,
  accept: CHAT_ATTACHMENT_ACCEPT,
  reset: true,
});

// Computed
const hasFinishedAttachment = computed(() =>
  props.items.some((item) => item.status === 'done'),
);
const isUploading = computed(() =>
  props.items.some((item) => item.status === 'uploading'),
);
// Text or a finished upload is enough to send; an in-flight upload blocks
// it, so the outgoing message never references an attachment that doesn't
// exist yet (docs/media-library/prd.md, decision 7).
const canSubmit = computed(
  () =>
    (text.value.trim().length > 0 || hasFinishedAttachment.value) &&
    !isUploading.value,
);

// Functions
function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (files.length > 0) emit('files', files);
}

function onSubmit(event: Event) {
  event.preventDefault();
  if (props.isBusy) {
    emit('stop');
    return;
  }
  if (!canSubmit.value) return;
  const trimmedText = text.value.trim();
  text.value = '';
  emit('submit', trimmedText);
}

// Hooks
onFilesPicked((fileList) => {
  if (fileList) emit('files', Array.from(fileList));
});

onMounted(() => {
  containerRef.value?.querySelector('textarea')?.focus();
});
</script>

<template>
  <form class="w-full" @submit.prevent="onSubmit">
    <div v-if="items.length > 0" class="mb-2 flex flex-wrap gap-2">
      <ChatPendingAttachment
        v-for="item in items"
        :key="item.id"
        :item="item"
        @retry="emit('retry', $event)"
        @remove="emit('remove', $event)"
      />
    </div>

    <div ref="containerRef" class="relative">
      <Textarea
        v-model="text"
        :placeholder="t('chat.input.placeholder')"
        name="message"
        class="max-h-48 min-h-12 resize-none overflow-y-auto rounded-xl bg-stone-50 py-3 pr-20 shadow-inner!"
        @keydown.enter.exact.prevent="onSubmit"
        @paste="onPaste"
      />
      <div class="absolute right-2 bottom-2 flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          :title="t('chat.input.attach')"
          @click="openFilePicker()"
        >
          <PaperclipIcon class="size-4 stroke-1.5 opacity-75" />
        </Button>
        <PromptInputSubmit :status="status" :disabled="!isBusy && !canSubmit" />
      </div>
    </div>
  </form>
</template>
