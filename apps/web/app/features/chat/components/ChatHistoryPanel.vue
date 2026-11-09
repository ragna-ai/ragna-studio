<script setup lang="ts">
import { Button } from '~/components/ui/button';
import ChatHistoryItemRow from '~/features/chat/components/ChatHistoryItem.vue';
import {
  useGetChatHistory,
  type ChatHistoryItem,
} from '~/features/chat/composables/useChatApi';
import {
  groupChatsByRecency,
  type ChatHistoryGroup,
} from '~/features/chat/lib/chat-history-groups';
import { useSidePanelStore } from '~/stores/sidepanel.store';

// Composables
const { t } = useI18n();
const route = useRoute();
const localePath = useLocalePath();
const sidePanel = useSidePanelStore();
const { data, isPending: isLoading } = useGetChatHistory();

// Refs
const search = ref('');

// Computed
const filteredChats = computed<ChatHistoryItem[]>(() => {
  const needle = search.value.trim().toLowerCase();
  const chats = data.value?.chats ?? [];
  if (!needle) return chats;
  return chats.filter((chat) => chat.title.toLowerCase().includes(needle));
});
const groups = computed<ChatHistoryGroup<ChatHistoryItem>[]>(() =>
  groupChatsByRecency(filteredChats.value),
);

// Functions
function isActiveChat(chatId: string): boolean {
  return route.params.chatId === chatId;
}

function openFullSearch() {
  const q = search.value.trim();
  navigateTo({ path: localePath('/chat/search'), query: q ? { q } : {} });
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex h-13 shrink-0 items-center gap-2 px-2">
      <NavSideToggle />
      <div class="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      <h2 class="ml-3 min-w-0 flex-1 truncate text-body font-medium">
        {{ t('chat.history.paneTitle') }}
      </h2>
      <NuxtLinkLocale
        to="/chat"
        class="flex size-8 shrink-0 items-center justify-center rounded-md text-icon hover:bg-border"
        :title="t('chat.history.newChat')"
        :aria-label="t('chat.history.newChat')"
      >
        <Icon name="hugeicons:bubble-chat-add" class="size-4" />
      </NuxtLinkLocale>
      <Button
        variant="ghost"
        size="icon"
        class="text-icon hover:bg-border"
        :title="t('chat.history.collapse')"
        :aria-label="t('chat.history.collapse')"
        @click="sidePanel.close()"
      >
        <Icon name="hugeicons:sidebar-left" class="size-4" />
      </Button>
    </div>

    <div class="px-3 pb-2">
      <label
        class="flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring"
      >
        <Icon name="hugeicons:search-01" class="size-4 shrink-0 text-icon" />
        <input
          v-model="search"
          type="search"
          class="min-w-0 flex-1 bg-transparent text-body outline-hidden placeholder:text-muted-foreground"
          :placeholder="t('chat.history.search')"
          :aria-label="t('chat.history.search')"
          @keydown.enter.prevent="openFullSearch"
        />
      </label>
    </div>

    <div v-if="isLoading" class="flex flex-col gap-3 px-4 py-3">
      <div
        v-for="n in 6"
        :key="n"
        class="h-4 w-full animate-pulse rounded bg-border"
      />
    </div>

    <p
      v-else-if="groups.length === 0"
      class="px-4 py-3 text-small text-muted-foreground"
    >
      {{ t('chat.history.empty') }}
    </p>

    <div
      v-else
      class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2"
    >
      <template v-for="group in groups" :key="group.key">
        <div
          class="flex h-8 shrink-0 items-end px-2 pb-1.5 text-caption font-medium text-muted-foreground"
        >
          {{ t(`chat.history.groups.${group.key}`) }}
        </div>
        <ChatHistoryItemRow
          v-for="chat in group.chats"
          :key="chat.id"
          :chat="chat"
          :active="isActiveChat(chat.id)"
        />
      </template>
    </div>
  </div>
</template>
