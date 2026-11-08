<script setup lang="ts">
import ChatConversation from '~/features/chat/components/ChatConversation.vue';
import ChatHistoryToggle from '~/features/chat/components/ChatHistoryToggle.vue';
import { useSidePanelStore } from '~/stores/sidepanel.store';
import ChatSearchButton from '~/features/chat/components/ChatSearchButton.vue';

// Composables
const sidePanel = useSidePanelStore();
const { t } = useI18n();

useHead({
  title: t('chat.conversation.title'),
});

// Computed
const isHistoryOpen = computed(() => sidePanel.view === 'chat-history');
const crumbs = computed<PageCrumb[]>(() => [{ label: t('chat.newChat') }]);
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
          <ChatSearchButton />
        </template>
      </NavTopBar>
    </template>
    <ChatConversation />
  </PagePanel>
</template>
