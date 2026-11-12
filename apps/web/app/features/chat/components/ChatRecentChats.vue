<script setup lang="ts">
import { Button } from '~/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import ChatRecentRows from '~/features/chat/components/ChatRecentRows.vue';
import { useGetRecentChats } from '~/features/chat/composables/useChatApi';
import { useChatStore } from '~/features/chat/stores/chat.store';
import type { ChatRecentRowItem } from '~/features/chat/types';

// Composables
const { t } = useI18n();
const { data } = useGetRecentChats();
const chatStore = useChatStore();
const { recentChatsHidden } = storeToRefs(chatStore);

// Computed
const recentChats = computed<ChatRecentRowItem[]>(() =>
  (data.value?.chats ?? []).map((chat) => ({
    id: chat.id,
    title: chat.title,
    agentId: chat.agent.id,
    agentName: chat.agent.name,
    icon: chat.agent.icon,
    tone: chat.agent.tone,
    imageUrl: chat.agent.imageUrl,
    lastMessageAt: chat.lastMessageAt,
  })),
);
const toggleLabel = computed(() =>
  recentChatsHidden.value ? t('chat.recent.show') : t('chat.recent.hide'),
);

// Functions
function toggleHidden() {
  recentChatsHidden.value = !recentChatsHidden.value;
}
</script>

<template>
  <section v-if="recentChats.length > 0" class="w-full">
    <div class="flex h-8 items-center gap-1 px-1">
      <h2
        class="font-mono text-caption font-medium tracking-[0.04em] text-muted-foreground uppercase"
      >
        {{ t('chat.recent.title') }}
      </h2>
      <TooltipProvider :delay-duration="300">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="ml-auto"
              :aria-label="toggleLabel"
              :aria-pressed="recentChatsHidden"
              @click="toggleHidden"
            >
              <Icon
                :name="
                  recentChatsHidden ? 'hugeicons:view' : 'hugeicons:view-off'
                "
                class="size-4 text-icon"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ toggleLabel }}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <NuxtLinkLocale
        to="/chat/history"
        class="flex items-center gap-0.5 text-body font-medium text-muted-foreground hover:text-foreground"
      >
        {{ t('chat.recent.viewAll') }}
        <Icon name="hugeicons:arrow-right-01" class="size-3.5" />
      </NuxtLinkLocale>
    </div>
    <ChatRecentRows v-if="!recentChatsHidden" :chats="recentChats" />
  </section>
</template>
