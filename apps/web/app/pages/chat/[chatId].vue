<script setup lang="ts">
import { Shimmer } from '~/components/ai-elements/shimmer';
import ChatConversation from '~/features/chat/components/ChatConversation.vue';
import ChatHeading from '~/features/chat/components/ChatHeading.vue';
import ChatHistoryToggle from '~/features/chat/components/ChatHistoryToggle.vue';
import { useGetChat } from '~/features/chat/composables/useChatApi';
import { useChatStore } from '~/features/chat/stores/chat.store';

definePageMeta({
  validate: (route) => hasValidChatId(route.params),
});

const route = useRoute();
const chatId = computed(() => route.params.chatId as string);

// Composables
const { data, isLoading, error: chatError } = useGetChat(chatId);
const { t } = useI18n();
const chatStore = useChatStore();

useHead({
  title: () => data.value?.chat?.title ?? t('chat.conversation.title'),
});

// Computed

// if the chat is taking longer than 500ms to load, show a loading state
// this is to prevent flickering when the chat loads quickly
// the problem with current implementation: if users switches chats quickly, the timeout might still set loadingTakesLonger to true for the previous chat.
// fixed by using onScopeDispose to clear the timeout when the component is unmounted or the watcher is re-run
const loadingTakesLonger = ref(false);
watch(
  () => isLoading.value,
  (newIsLoading) => {
    if (newIsLoading) {
      const timeout = setTimeout(() => {
        if (isLoading.value) {
          loadingTakesLonger.value = true;
        }
      }, 500);
      onScopeDispose(() => clearTimeout(timeout));
    } else {
      loadingTakesLonger.value = false;
    }
  },
  { immediate: true },
);

watch(
  () => data.value?.chat,
  (chat) => {
    chatStore.setChat(chat);
  },
  { immediate: true },
);

onScopeDispose(() => chatStore.setChat());
</script>

<template>
  <ChatHistoryToggle class="absolute top-2 left-2 z-10" />
  <div class="absolute top-2 right-5 z-10">
    <ChatHeading v-if="chatStore.id" />
  </div>
  <ChatConversation
    v-if="data?.chat"
    :key="data.chat.id"
    :chatId="data.chat.id"
    :initialMessages="data.chat.messages ?? []"
  />
  <div
    v-else-if="chatError"
    class="flex h-full w-full items-center justify-center"
  >
    <p class="text-sm text-stone-500">
      {{ chatError.message || 'An error occurred while fetching the chat.' }}
    </p>
  </div>
  <div
    v-if="loadingTakesLonger"
    class="flex h-full w-full items-center justify-center"
  >
    <Shimmer class="h-6 w-48"> Loading chat... </Shimmer>
  </div>
</template>
