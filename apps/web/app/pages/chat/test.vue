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

useHead({
  title: 'Chat Test',
});

// Composables
const { messages, sendMessage, status, error } = useChat({
  transport: new DefaultChatTransport({
    api: `${useRuntimeConfig().public.apiBaseUrl}/chat/test`,
    credentials: 'include',
  }),
});

// Computed
const isBusy = computed(
  () => status.value === 'submitted' || status.value === 'streaming',
);

// Functions
function handleSubmit(message: PromptInputMessage) {
  const text = message.text.trim();
  if (!text || isBusy.value) {
    return;
  }
  sendMessage({ text });
}
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 p-4">
    <h1 class="text-lg font-semibold">Chat Test</h1>

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
