<script setup lang="ts">
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { useChat } from '@ai-sdk/vue';
import { DefaultChatTransport } from '@repo/ai/client';
import type { UIMessage } from 'ai';
import { useCreateChat } from '~/features/chat/composables/useChatApi';

interface Props {
  chatId?: string;
  initialMessages?: UIMessage[];
}

const props = defineProps<Props>();
const chatId = ref(props.chatId ?? null);

// Composables
const { mutateAsync: createNewChat } = useCreateChat();

const { messages, sendMessage, status, error } = useChat({
  messages: props.initialMessages,
  transport: new DefaultChatTransport({
    credentials: 'include',
    prepareSendMessagesRequest: ({ messages, body, trigger, messageId }) => ({
      api: `${useRuntimeConfig().public.apiBaseUrl}/chat/${chatId.value}`,
      body: { ...body, messages, trigger, messageId },
      credentials: 'include',
    }),
  }),
});

// Template refs
const conversation = useTemplateRef('conversation');
const activeTurnEl = useTemplateRef('activeTurn');

// The scroll container inside the Conversation, measured for the pin-to-top gap.
const scrollEl = computed<HTMLElement | null>(
  () => conversation.value?.scrollRef ?? null,
);
const { height: viewportHeight } = useElementSize(scrollEl);

// Computed
const isBusy = computed(
  () => status.value === 'submitted' || status.value === 'streaming',
);

// Split messages into settled history and the active turn (the latest user
// message plus its in-flight assistant response). The active turn gets a
// min-height of one viewport so it can be scrolled to the top of the view.
const lastUserIndex = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i]!.role === 'user') return i;
  }
  return -1;
});

const priorMessages = computed(() =>
  lastUserIndex.value === -1
    ? messages.value
    : messages.value.slice(0, lastUserIndex.value),
);

const activeTurnMessages = computed(() =>
  lastUserIndex.value === -1 ? [] : messages.value.slice(lastUserIndex.value),
);

// Gap left above the pinned message when scrolled to the top (px).
const PIN_TOP_GAP = 16;

// The pin only engages for turns submitted in this session. History-loaded
// chats keep the default scrolled-to-bottom behavior with no reserved space.
const pinEngaged = ref(false);
let pinnedScrollTop = 0;

async function pinActiveTurnToTop(behavior: ScrollBehavior = 'smooth') {
  await nextTick();

  const container = scrollEl.value;
  const turn = activeTurnEl.value;
  if (!container || !turn) return;

  // Release the stick-to-bottom lock so its resize-follow animation does not
  // cancel this scroll.
  conversation.value?.stopScroll();

  const offset =
    turn.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop;
  pinnedScrollTop = Math.max(0, offset - PIN_TOP_GAP);
  container.scrollTo({ top: pinnedScrollTop, behavior });
}

// Pin the latest message to the top when it is submitted.
watch(status, (value) => {
  if (value === 'submitted') {
    pinEngaged.value = true;
    pinActiveTurnToTop('smooth');
  }
});

// The container height only changes on an actual resize, so re-pin the active
// turn instantly to keep it from drifting out of the reserved space. Skip it
// when the user has scrolled away from the pinned position.
watch(viewportHeight, () => {
  if (!pinEngaged.value) return;
  const container = scrollEl.value;
  if (!container) return;
  if (Math.abs(container.scrollTop - pinnedScrollTop) > 2) return;
  pinActiveTurnToTop('auto');
});

// Functions
async function handleSubmit(message: PromptInputMessage) {
  const text = message.text.trim();
  if (!text || isBusy.value) {
    return;
  }

  if (!chatId.value) {
    try {
      const { chat } = await createNewChat({ agentId: undefined });
      if (!chat) throw createError({ statusMessage: 'Failed to create chat' });
      chatId.value = chat.id;
    } catch {
      return;
    }
  }

  sendMessage({ text });
}
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 p-4">
    <Conversation ref="conversation" class="rounded-md border-0">
      <ConversationContent>
        <ConversationEmptyState
          v-if="messages.length === 0"
          title="No messages yet"
          description="Send a message to start the conversation."
        />

        <Message
          v-for="message in priorMessages"
          :key="message.id"
          :from="message.role"
        >
          <MessageContent>
            <template v-for="(part, index) in message.parts" :key="index">
              <MessageResponse
                v-if="part.type === 'text'"
                :content="part.text"
              />
            </template>
          </MessageContent>
        </Message>

        <div
          v-if="activeTurnMessages.length > 0"
          ref="activeTurn"
          class="flex flex-col gap-8"
          :style="
            pinEngaged && viewportHeight
              ? { minHeight: `${viewportHeight}px` }
              : undefined
          "
        >
          <Message
            v-for="message in activeTurnMessages"
            :key="message.id"
            :from="message.role"
          >
            <MessageContent>
              <template v-for="(part, index) in message.parts" :key="index">
                <MessageResponse
                  v-if="part.type === 'text'"
                  :content="part.text"
                />
              </template>
            </MessageContent>
          </Message>

          <Shimmer v-if="status === 'submitted'" class="text-sm">
            Thinking...
          </Shimmer>
          <p v-if="error" class="text-sm text-destructive">
            {{ error.message }}
          </p>
        </div>
      </ConversationContent>

      <ConversationScrollButton />
    </Conversation>

    <PromptInput multiple global-drop @submit="handleSubmit">
      <PromptInputBody>
        <PromptInputTextarea class="" autofocus />
      </PromptInputBody>
      <PromptInputFooter @click="() => console.log('footer clicked')">
        <PromptInputSubmit
          class="ml-auto"
          :status="status"
          :disabled="isBusy"
        />
      </PromptInputFooter>
    </PromptInput>
  </div>
</template>
