<script setup lang="ts">
import ChatConversation from '~/features/chat/components/ChatConversation.vue';
import ChatHistoryToggle from '~/features/chat/components/ChatHistoryToggle.vue';

// Composables
const { t } = useI18n();

useHead({
  title: t('chat.conversation.title'),
});

// Computed

// Functions
</script>

<template>
  <ChatHistoryToggle class="absolute left-2 top-2 z-10" />
  <ChatConversation />
</template>
