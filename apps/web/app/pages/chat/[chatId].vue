<script setup lang="ts">
import { Shimmer } from '~/components/ai-elements/shimmer';
import ChatConversation from '~/features/chat/components/ChatConversation.vue';
import { useGetChat } from '~/features/chat/composables/useChatApi';

useHead({
  title: 'Chat Conversation',
});

definePageMeta({
  title: 'Chat Conversation',
  validate: (route) => hasValidChatId(route.params),
});

const route = useRoute();
const chatId = computed(() => route.params.chatId as string);

// Composables
const { data, error: chatError } = useGetChat(chatId);
</script>

<template>
  <ChatConversation
    v-if="data?.chat"
    :key="data.chat.id"
    :chatId="data.chat.id"
    :initialMessages="data.chat.messages"
  />
  <div
    v-else-if="chatError"
    class="flex h-full w-full items-center justify-center"
  >
    <p class="text-sm text-stone-500">
      {{ chatError.message || 'An error occurred while fetching the chat.' }}
    </p>
  </div>
  <div v-else class="flex h-full w-full items-center justify-center">
    <Shimmer class="h-6 w-48"> Loading chat... </Shimmer>
  </div>
</template>
