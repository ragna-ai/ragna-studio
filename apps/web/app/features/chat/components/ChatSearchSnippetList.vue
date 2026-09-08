<script setup lang="ts">
import ChatSearchHighlightedText from '~/features/chat/components/ChatSearchHighlightedText.vue';
import type { ChatSearchSnippet } from '~/features/chat/composables/useChatSearchApi';

// Props
interface Props {
  snippets: ChatSearchSnippet[];
  query: string;
}
defineProps<Props>();
</script>

<template>
  <ul class="mt-1 space-y-1">
    <li
      v-for="snippet in snippets"
      :key="snippet.messageId"
      class="truncate text-sm text-muted-foreground"
    >
      <ChatSearchHighlightedText :text="snippet.snippet" :query="query" />
    </li>
  </ul>
</template>
