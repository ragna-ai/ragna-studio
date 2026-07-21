<script setup lang="ts">
import type { HomeOverviewChatItem } from '~/features/home/types';

// Props
defineProps<{ chats: HomeOverviewChatItem[] }>();

// Composables
const { locale } = useI18n();
</script>

<template>
  <div class="divide-y divide-foreground/5">
    <NuxtLinkLocale
      v-for="chat in chats"
      :key="chat.id"
      :to="`/chat/${chat.id}`"
      class="flex items-center gap-3 px-6 py-2.5 text-sm hover:bg-accent"
    >
      <div class="min-w-0 grow">
        <p class="truncate font-medium text-foreground">{{ chat.title }}</p>
        <p class="truncate text-xs text-muted-foreground">{{ chat.agentName }}</p>
      </div>
      <NuxtTime
        :datetime="chat.updatedAt"
        :locale="locale"
        relative
        class="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
      />
    </NuxtLinkLocale>
  </div>
</template>
