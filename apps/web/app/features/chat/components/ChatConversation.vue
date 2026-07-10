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
import useChatApi from '~/features/chat/composables/useChatApi';

interface Props {
  chatId?: string;
  initialMessages?: UIMessage[];
}

const props = defineProps<Props>();
const chatId = ref(props.chatId ?? null);

// Composables
const { createChat } = useChatApi();
const { mutateAsync: createNewChat } = createChat();

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

// Computed
const isBusy = computed(
  () => status.value === 'submitted' || status.value === 'streaming',
);

// Functions
async function handleSubmit(message: PromptInputMessage) {
  const text = message.text.trim();
  if (!text || isBusy.value) {
    return;
  }

  if (!chatId.value) {
    try {
      const { chat } = await createNewChat({ assistantId: undefined });
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
  <div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 p-4">
    <Conversation class="rounded-md border">
      <ConversationContent>
        <ConversationEmptyState
          v-if="messages.length === 0"
          title="No messages yet"
          description="Send a message to start the conversation."
        />

        <Message
          v-for="message in messages"
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
        <p v-if="error" class="text-sm text-destructive">{{ error.message }}</p>
      </ConversationContent>

      <ConversationScrollButton />
    </Conversation>

    <PromptInput @submit="handleSubmit">
      <PromptInputBody>
        <PromptInputTextarea class="min-h-8" :disabled="isBusy" autofocus />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputSubmit
          class="ml-auto"
          :status="status"
          :disabled="isBusy"
        />
      </PromptInputFooter>
    </PromptInput>
  </div>
</template>
