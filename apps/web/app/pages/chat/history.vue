<script setup lang="ts">
import ChatManyTable from '~/features/chat/components/ChatManyTable.vue';
import { useDeleteChat } from '~/features/chat/composables/useChatApi';
import useChatList from '~/features/chat/composables/useChatList';

// Props
// Emits

// Refs

// Composables
const { page, limit, useGetAllChats } = useChatList();
const { data, error: chatsError } = useGetAllChats();
const { mutateAsync: deleteChat } = useDeleteChat();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('chat.history.title'),
});

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });

// Functions
const handleDeleteChat = async (chatId: string) => {
  const confirmed = await confirm({
    title: t('chat.deleteConfirm.title'),
    message: t('chat.deleteConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteChat(chatId);
};

// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="$t('chat.history.title')"
          :subtitle="$t('chat.history.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>
    <div v-if="data?.chats" class="px-5">
      <ChatManyTable
        :chats="data.chats"
        :meta="meta"
        @delete-chat="handleDeleteChat"
      />
      <div class="pb-10">
        <!-- Pagination Controls -->
        <PaginateControls
          v-model:page="page"
          v-model:limit="limit"
          :meta="meta"
        />
      </div>
    </div>
    <div v-else-if="chatsError">
      <p class="text-sm text-stone-500">
        {{ chatsError.message || $t('chat.view.historyLoadError') }}
      </p>
    </div>
  </SectionWrapper>
</template>
