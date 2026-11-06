<script setup lang="ts">
import { ArrowRightIcon, EyeIcon, EyeOffIcon } from '@lucide/vue';
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
import type { ChatRecentItem } from '~/features/chat/types';

// Composables
const { t } = useI18n();
const { data } = useGetRecentChats();
const chatStore = useChatStore();
const { recentChatsHidden } = storeToRefs(chatStore);

// Computed
const recentChats = computed<ChatRecentItem[]>(() =>
  (data.value?.chats ?? []).map((chat) => ({
    id: chat.id,
    title: chat.title,
    agentName: chat.agent.name,
    updatedAt: chat.updatedAt,
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
  <section v-if="recentChats.length > 0" class="mt-6 w-full">
    <TooltipProvider :delay-duration="300">
      <div class="flex items-center justify-between px-3">
        <h2 class="text-xs font-medium text-muted-foreground">
          {{ t('chat.recent.title') }}
        </h2>
        <div class="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="toggleLabel"
                @click="toggleHidden"
              >
                <EyeIcon
                  v-if="recentChatsHidden"
                  class="size-4 stroke-1.5 opacity-75"
                />
                <EyeOffIcon v-else class="size-4 stroke-1.5 opacity-75" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ toggleLabel }}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="t('chat.recent.viewAll')"
                as-child
              >
                <NuxtLinkLocale to="/chat/history">
                  <ArrowRightIcon class="size-4 stroke-1.5 opacity-75" />
                </NuxtLinkLocale>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ t('chat.recent.viewAll') }}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
    <ChatRecentRows
      v-if="!recentChatsHidden"
      :chats="recentChats"
      row-class="rounded-md px-3"
      class="mt-1"
    />
  </section>
</template>
