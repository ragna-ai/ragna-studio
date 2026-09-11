<script setup lang="ts">
import { Loader } from '@/components/ai-elements/loader';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { useChat } from '@ai-sdk/vue';
import {
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type FileUIPart,
  type UIDataTypes,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from 'ai';
import { toast } from 'vue-sonner';
import ChatInput from '~/features/chat/components/ChatInput.vue';
import ChatMessage from '~/features/chat/components/ChatMessage.vue';
import {
  useCreateChat,
  type ChatAttachment,
} from '~/features/chat/composables/useChatApi';
import { useChatAttachments } from '~/features/chat/composables/useChatAttachments';
import { WebSocketChatTransport } from '~/features/chat/lib/WebSocketChatTransport';
import { useInvalidateCreditBalance } from '~/features/credit/composables/useCreditApi';
import { isOutOfCreditsError, OUT_OF_CREDITS_MESSAGE } from '~/lib/api-error';
import { createPrimaryId } from '~/lib/utils';

// Props
interface Props {
  chatId?: string;
  initialMessages?: UIMessage[];
}

const props = defineProps<Props>();

// Emits

// Refs
const conversationRef = useTemplateRef<HTMLDivElement>('conversationRef');
const chatId = ref(props.chatId ?? null);
const inputText = ref('');

// Composables
const { mutateAsync: createNewChat } = useCreateChat();
const invalidateCreditBalance = useInvalidateCreditBalance();
const chatAttachments = useChatAttachments(ensureChat);
// Drop anywhere over the conversation, not just the input (decision 7):
// the overlay covers the whole container while a drag is over it.
const { isOverDropZone } = useDropZone(conversationRef, {
  multiple: true,
  onDrop: (files) => {
    if (files) chatAttachments.handleFiles(files);
  },
});

// Computed
const initialMessages = props.initialMessages
  ? structuredClone(toRaw(props.initialMessages))
  : undefined;

// The imageGen/videoGen tools write a transient `data-imageGen` /
// `data-videoGen` chunk the moment generation starts. Transient chunks never
// land in message.parts (ai's stream reducer routes them straight to
// `onData` and drops them), so this is the only place they're observable,
// display-only, never persisted.
type ActiveGeneration = {
  kind: 'imageGen' | 'videoGen';
  prompt: string;
};

function extractGenerationPrompt(data: unknown): string {
  return (data as { prompt?: string } | undefined)?.prompt ?? '';
}

// Set by onData below, latest generation wins. Read through the
// `activeGeneration` computed, which is what actually clears it.
const lastGenerationEvent = ref<ActiveGeneration | null>(null);

const isSubscribed = ref(false);
const chatTransport = new WebSocketChatTransport(
  () => chatId.value,
  (subscribed) => {
    isSubscribed.value = subscribed;
  },
);

const { messages, sendMessage, status, error, stop } = useChat({
  messages: initialMessages,
  generateId: createPrimaryId,
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  transport: chatTransport,
  onData: (dataPart) => {
    if (dataPart.type === 'data-imageGen') {
      lastGenerationEvent.value = {
        kind: 'imageGen',
        prompt: extractGenerationPrompt(dataPart.data),
      };
    } else if (dataPart.type === 'data-videoGen') {
      lastGenerationEvent.value = {
        kind: 'videoGen',
        prompt: extractGenerationPrompt(dataPart.data),
      };
    } else {
      // TODO: check if we should clear lastGenerationEvent.value here when a non-gen data part arrives.
    }
  },
  // A turn that wasn't aborted just settled a charge server-side
  // (docs/credits/prd.md, "Frontend"), so the cached balance is stale.
  // Aborted turns charge nothing (onEnd's early return on `isAborted`), so
  // there's nothing new to fetch.
  onFinish: ({ isAbort }) => {
    if (!isAbort) invalidateCreditBalance();
  },
  // The WS transport carries `code: 402` on an out-of-credits refusal
  // (WebSocketChatTransport.ts); everything else is left to the inline
  // `error.message` rendering below.
  onError: (streamError) => {
    if (isOutOfCreditsError(streamError)) {
      toast.error(OUT_OF_CREDITS_MESSAGE);
    }
  },
});

const isBusy = computed(
  () => status.value === 'submitted' || status.value === 'streaming',
);

// Derived, not mutated directly: clears itself once the stream leaves
// 'streaming' (finish, error, abort) or once the matching tool part
// resolves, so the indicator never lingers next to an already-rendered
// result. Doesn't distinguish multiple same-kind calls in one turn, an edge
// case rare enough to skip for v1.
const activeGeneration = computed<ActiveGeneration | null>(() => {
  const generation = lastGenerationEvent.value;
  if (!generation || status.value !== 'streaming') return null;

  const last = messages.value.at(-1);
  if (last?.role !== 'assistant') return generation;

  const toolType = `tool-${generation.kind}`;
  const hasResolved = last.parts.some(
    (part) =>
      part.type === toolType &&
      'state' in part &&
      (part.state === 'output-available' || part.state === 'output-error'),
  );

  return hasResolved ? null : generation;
});

// The server opens the stream before the first token arrives, so the status
// flips to 'streaming' while there is still nothing to show. Keep the shimmer
// until the assistant reply renders something (text, reasoning, or a tool call).
const isVisiblePart = (part: UIMessagePart<UIDataTypes, UITools>) => {
  if (part.type === 'text' || part.type === 'reasoning') {
    return part.text.length > 0;
  }
  return isToolUIPart(part);
};

const hasVisibleReply = computed(() => {
  const last = messages.value.at(-1);
  if (last?.role !== 'assistant') return false;
  return last.parts.some(isVisiblePart);
});

// Functions

// Chat creation is lazy: the first attachment or the first sent message is
// what actually creates the chat. Both the attachments composable and
// handleSubmit below call this, and it's a no-op once chatId is set.
async function ensureChat(): Promise<string> {
  if (chatId.value) return chatId.value;

  const { chat } = await createNewChat({ agentId: undefined });
  if (!chat) throw createError({ statusMessage: 'Failed to create chat' });
  chatId.value = chat.id;
  return chatId.value;
}

function toFilePart(attachment: ChatAttachment): FileUIPart {
  return {
    type: 'file',
    mediaType: attachment.mediaType,
    url: attachment.url,
    filename: attachment.filename,
  };
}

async function handleSubmit(text: string) {
  // if text is empty or whitespace, don't send it
  if (!text || text.trim().length === 0) return;

  try {
    await ensureChat();
  } catch {
    return;
  }

  const files = chatAttachments.finishedAttachments.value.map(toFilePart);
  chatAttachments.clear();
  sendMessage({ text, files: files.length > 0 ? files : undefined });
}
</script>

<template>
  <div ref="conversationRef" class="relative flex h-full w-full flex-col p-4">
    <!-- Drag-n-drop overlay, covers the whole conversation while dragging -->
    <div
      v-if="isOverDropZone"
      class="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm"
    >
      <p class="text-sm font-medium text-primary">
        {{ $t('chat.attachment.dropHint') }}
      </p>
    </div>
    <MessageScrollerProvider auto-scroll default-scroll-position="last-anchor">
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent
            :aria-busy="isBusy"
            class="mx-auto max-w-3xl pb-8"
          >
            <MessageScrollerItem
              v-for="message in messages"
              :key="message.id"
              :message-id="message.id"
              :scroll-anchor="message.role === 'user'"
            >
              <!-- Message -->
              <ChatMessage
                v-if="chatId"
                :key="message.id"
                :message="message"
                :chat-id="chatId"
              />
              <!-- end chat message -->
            </MessageScrollerItem>
            <!-- Generating image/video -->
            <Shimmer v-if="activeGeneration" class="text-sm">
              {{
                $t(`agent.tool.${activeGeneration.kind}.generating`, {
                  prompt: activeGeneration.prompt,
                })
              }}
            </Shimmer>
            <!-- Loading -->
            <div v-else-if="isSubscribed" class="flex items-center gap-2">
              <Loader />
            </div>
            <p v-if="error" class="text-sm text-destructive">
              {{ error.message }}
            </p>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>

    <!-- Disclaimer -->
    <!-- 
    <div class="mt-auto border-0">
      <p class="pt-8 pb-2 text-center text-xs text-muted-foreground/75">
        {{ $t('chat.conversation.disclaimer') }}
      </p>
    </div>
    -->

    <!-- input -->
    <div class="mx-auto w-full max-w-4xl">
      <ChatInput
        v-model="inputText"
        :items="chatAttachments.items.value"
        :status="status"
        :is-busy="isBusy"
        @submit="handleSubmit"
        @stop="stop"
        @files="chatAttachments.handleFiles"
        @retry="chatAttachments.retry"
        @remove="chatAttachments.remove"
      />
    </div>
  </div>
</template>
