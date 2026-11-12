<script setup lang="ts">
import { NuxtLinkLocale } from '#components';
import ChatManyTable from '~/features/chat/components/ChatManyTable.vue';
import ChatRenameDialog from '~/features/chat/components/ChatRenameDialog.vue';
import type { ChatHistoryItem } from '~/features/chat/composables/useChatApi';
import { useDeleteChat } from '~/features/chat/composables/useChatApi';
import useChatList from '~/features/chat/composables/useChatList';

// Props
// Emits

// Composables
const { page, limit, useGetAllChats } = useChatList();
const { data, error, isPending, refetch } = useGetAllChats();
const { mutateAsync: deleteChat } = useDeleteChat();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('chat.history.title'),
});

// Refs
const searchText = ref('');
const renamingChat = ref<ChatHistoryItem | null>(null);

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });
const hasNoChatsAtAll = computed(() => data.value?.meta.totalCount === 0);
const isRenameOpen = computed({
  get: () => renamingChat.value !== null,
  set: (isOpen) => {
    if (!isOpen) {
      renamingChat.value = null;
    }
  },
});

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
</script>

<template>
  <PagePanel>
    <SectionWrapper>
      <Heading>
        <template #top>
          <HeadingTitle
            :title="t('chat.history.title')"
            :subtitle="t('chat.history.subtitle')"
          >
            <template #button>
              <Button
                :as="NuxtLinkLocale"
                to="/chat"
                leading-icon="hugeicons:plus-sign"
              >
                {{ t('chat.history.newChat') }}
              </Button>
            </template>
          </HeadingTitle>
        </template>
      </Heading>
      <div class="px-page pt-6">
        <ListErrorAlert
          v-if="error && !data"
          :title="t('chat.history.loadError.title')"
          :description="t('chat.history.loadError.description')"
          @retry="refetch()"
        />
        <Empty v-else-if="hasNoChatsAtAll">
          <EmptyMedia variant="icon">
            <Icon name="hugeicons:message-multiple-01" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{{ t('chat.history.empty') }}</EmptyTitle>
            <EmptyDescription>
              {{ t('chat.history.emptyDescription') }}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              :as="NuxtLinkLocale"
              to="/chat"
              leading-icon="hugeicons:plus-sign"
            >
              {{ t('chat.history.newChat') }}
            </Button>
          </EmptyContent>
        </Empty>
        <template v-else>
          <div class="flex h-11 items-center border-b">
            <ListSearch
              v-model="searchText"
              :placeholder="t('chat.history.search')"
            />
          </div>
          <ChatManyTable
            :chats="data?.chats ?? []"
            :is-loading="isPending"
            @rename-chat="renamingChat = $event"
            @delete-chat="handleDeleteChat"
          />
          <ListPagination
            v-if="!isPending && meta.totalCount > 0"
            v-model:page="page"
            v-model:limit="limit"
            :total-count="meta.totalCount"
            noun="chat.history.count"
          />
        </template>
      </div>
    </SectionWrapper>
    <ChatRenameDialog
      v-if="renamingChat"
      v-model:open="isRenameOpen"
      :chat="renamingChat"
    />
  </PagePanel>
</template>
