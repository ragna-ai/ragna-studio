<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';
import { DefaultChatTransport } from '@repo/ai/client';

useHead({
  title: 'Chat Test',
});

// Refs
const input = ref('');

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
function handleSubmit() {
  const text = input.value.trim();
  if (!text || isBusy.value) {
    return;
  }
  sendMessage({ text });
  input.value = '';
}
</script>

<template>
  <div class="mx-auto flex h-dvh w-full max-w-2xl flex-col gap-4 p-4">
    <h1 class="text-lg font-semibold">Chat Test</h1>

    <div class="flex-1 space-y-4 overflow-y-auto rounded-md border p-4">
      <p v-if="messages.length === 0" class="text-sm text-muted-foreground">
        Send a message to start the conversation.
      </p>

      <div
        v-for="message in messages"
        :key="message.id"
        class="flex"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
          :class="
            message.role === 'user'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          "
        >
          <template v-for="(part, index) in message.parts" :key="index">
            <span v-if="part.type === 'text'">{{ part.text }}</span>
          </template>
        </div>
      </div>

      <p v-if="status === 'submitted'" class="text-sm text-muted-foreground">
        Thinking...
      </p>
      <p v-if="error" class="text-sm text-destructive">{{ error.message }}</p>
    </div>

    <form class="flex gap-2" @submit.prevent="handleSubmit">
      <Input
        v-model="input"
        placeholder="Type a message..."
        :disabled="isBusy"
        autofocus
      />
      <Button type="submit" :disabled="isBusy || !input.trim()">Send</Button>
    </form>
  </div>
</template>
