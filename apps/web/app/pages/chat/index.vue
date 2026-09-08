<script setup lang="ts">
import ChatConversation from '~/features/chat/components/ChatConversation.vue';
import ChatHistoryToggle from '~/features/chat/components/ChatHistoryToggle.vue';
import ChatSearchButton from '~/features/chat/components/ChatSearchButton.vue';

// Composables
const { t } = useI18n();

useHead({
  title: t('chat.conversation.title'),
});

// Computed

// Functions
</script>

<template>
  <div class="absolute top-2 left-2 z-10 flex flex-col gap-0">
    <ChatHistoryToggle />
    <ChatSearchButton />
  </div>
  <ChatConversation />
</template>
