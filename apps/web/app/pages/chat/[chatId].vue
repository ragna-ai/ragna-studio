<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { useSidePanelStore } from '~/stores/sidepanel.store';
import { Shimmer } from '~/components/ai-elements/shimmer';
import ChatAgentChip from '~/features/chat/components/ChatAgentChip.vue';
import ChatConversation from '~/features/chat/components/ChatConversation.vue';
import ChatHistoryToggle from '~/features/chat/components/ChatHistoryToggle.vue';
import { useGetChat } from '~/features/chat/composables/useChatApi';
import { useChatStore } from '~/features/chat/stores/chat.store';

definePageMeta({
  validate: (route) => hasValidChatId(route.params),
});

const route = useRoute();
const chatId = computed(() => route.params.chatId?.toString() ?? '');

// Composables
const sidePanel = useSidePanelStore();
const { t } = useI18n();
const chatStore = useChatStore();
const { data, isLoading, error: chatError } = useGetChat(chatId);

useHead({
  title: () => data.value?.chat?.title ?? t('chat.conversation.title'),
});

// Computed
const isHistoryOpen = computed(() => sidePanel.view === 'chat-history');
const crumbs = computed<PageCrumb[]>(() => [
  { label: data.value?.chat?.title ?? '' },
]);
const chatAgent = computed(() => data.value?.chat?.agent);

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
  <PagePanel>
    <template #header>
      <NavTopBar :crumbs="crumbs" :hide-sidebar-toggle="isHistoryOpen">
        <template v-if="!isHistoryOpen" #left>
          <ChatHistoryToggle />
          <div class="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
        </template>
        <template #right>
          <ChatAgentChip
            v-if="chatAgent"
            :agent-id="chatAgent.id"
            :name="chatAgent.name"
            :model-name="chatAgent.aiModel.displayName"
          />
          <Button
            variant="ghost"
            size="icon"
            class="text-icon"
            aria-disabled="true"
            :aria-label="$t('nav.topBar.moreActions')"
          >
            <Icon name="hugeicons:more-horizontal" class="size-4" />
          </Button>
        </template>
      </NavTopBar>
    </template>
    <ChatConversation
      v-if="data?.chat"
      :key="data.chat.id"
      :chatId="data.chat.id"
      :agent="data.chat.agent"
      :initialMessages="data.chat.messages ?? []"
    />
    <div
      v-else-if="chatError"
      class="flex h-full w-full items-center justify-center"
    >
      <p class="text-small text-muted-foreground">
        {{ chatError.message || t('chat.view.loadError') }}
      </p>
    </div>
    <div
      v-if="loadingTakesLonger"
      class="flex h-full w-full items-center justify-center"
    >
      <Shimmer class="h-6 w-48"> {{ t('chat.view.loading') }} </Shimmer>
    </div>
  </PagePanel>
</template>
