<script setup lang="ts">
import AgentMark from '~/features/agent/components/AgentMark.vue';
import type { ChatRecentRowItem } from '~/features/chat/types';

interface ChatRecentRowsProps {
  chats: ChatRecentRowItem[];
}

defineProps<ChatRecentRowsProps>();

const { locale } = useI18n();
</script>

<template>
  <div>
    <NuxtLinkLocale
      v-for="chat in chats"
      :key="chat.id"
      :to="`/chat/${chat.id}`"
      class="flex h-13 items-center gap-3 border-t px-1 hover:bg-surface-subtle"
    >
      <AgentMark
        :agent-id="chat.agentId"
        :icon="chat.icon"
        :tone="chat.tone"
        :image-url="chat.imageUrl"
        :size="28"
      />
      <div class="min-w-0 grow">
        <p class="truncate text-body font-medium text-foreground">
          {{ chat.title }}
        </p>
        <p class="truncate text-small text-muted-foreground">
          {{ chat.agentName }}
        </p>
      </div>
      <NuxtTime
        :datetime="chat.lastMessageAt"
        :locale="locale"
        relative
        class="shrink-0 text-caption whitespace-nowrap text-muted-foreground"
      />
    </NuxtLinkLocale>
  </div>
</template>
