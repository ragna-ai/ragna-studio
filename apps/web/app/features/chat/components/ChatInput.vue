<script setup lang="ts">
// Imports
import { PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import type { ChatStatus } from 'ai';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';
import ChatAddMenu from '~/features/chat/components/ChatAddMenu.vue';
import ChatPendingAttachment from '~/features/chat/components/ChatPendingAttachment.vue';
import type { PendingAttachment } from '~/features/chat/composables/useChatAttachments';
import { CHAT_ATTACHMENT_ACCEPT } from '~/features/chat/lib/attachment-mime';

const SUBMIT_ICON: Record<ChatStatus, string> = {
  ready: 'hugeicons:arrow-up-02',
  submitted: 'hugeicons:loading-03',
  streaming: 'hugeicons:stop',
  error: 'hugeicons:cancel-01',
};

// Props
interface ChatInputProps {
  items: PendingAttachment[];
  status: ChatStatus;
  isBusy: boolean;
  isSendDisabled?: boolean;
  isEmpty?: boolean;
  agentName?: string;
}

const props = defineProps<ChatInputProps>();

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
// exist yet.
const canSubmit = computed(
  () =>
    !props.isSendDisabled &&
    (text.value.trim().length > 0 || hasFinishedAttachment.value) &&
    !isUploading.value,
);

const placeholder = computed(() => {
  if (!props.agentName) return t('chat.input.placeholder');
  const key = props.isEmpty ? 'chat.input.askAgent' : 'chat.input.replyToAgent';
  return t(key, { agent: props.agentName });
});
const submitIcon = computed(() => SUBMIT_ICON[props.status]);
const submitIconClass = computed(() =>
  props.status === 'submitted' ? 'size-4 animate-spin' : 'size-4',
);

// Functions
function focus() {
  containerRef.value?.querySelector('textarea')?.focus();
}

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
defineExpose({ focus });

onFilesPicked((fileList) => {
  if (fileList) emit('files', Array.from(fileList));
});

onMounted(() => {
  containerRef.value?.querySelector('textarea')?.focus();
});
</script>

<template>
  <form class="w-full" @submit.prevent="onSubmit">
    <div
      ref="containerRef"
      class="flex flex-col gap-2 rounded-xl border border-border-strong bg-background px-2.5 pt-4 pb-2.5 shadow-xs focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
    >
      <div v-if="items.length > 0" class="flex flex-wrap gap-2">
        <ChatPendingAttachment
          v-for="item in items"
          :key="item.id"
          :item="item"
          @retry="emit('retry', $event)"
          @remove="emit('remove', $event)"
        />
      </div>

      <Textarea
        v-model="text"
        :placeholder="placeholder"
        name="message"
        :class="
          cn(
            'max-h-48 min-h-7 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-1.5 py-0 text-chat shadow-none focus-visible:ring-0 md:text-chat dark:bg-transparent',
            isEmpty && 'min-h-14',
          )
        "
        @keydown.enter.exact.prevent="onSubmit"
        @paste="onPaste"
      />

      <div class="flex h-8 items-center gap-0.5">
        <ChatAddMenu @add-files="openFilePicker()" />
        <slot name="toolbar-start" />
        <div class="ml-auto flex items-center gap-0.5">
          <slot name="toolbar-end" />
          <PromptInputSubmit
            :status="status"
            :disabled="!isBusy && !canSubmit"
            class="ml-0.5 size-8 rounded-md"
          >
            <Icon :name="submitIcon" :class="submitIconClass" />
          </PromptInputSubmit>
        </div>
      </div>
    </div>
  </form>
</template>
