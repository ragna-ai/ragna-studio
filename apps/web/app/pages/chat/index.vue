<script setup lang="ts">
import ChatConversation from '~/features/chat/components/ChatConversation.vue';

// Composables
const { t } = useI18n();

useHead({
  title: t('chat.conversation.title'),
});

// Computed

// Functions
</script>

<template>
  <ChatConversation />
</template>
