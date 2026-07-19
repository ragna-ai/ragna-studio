<script setup lang="ts">
import { storeToRefs } from 'pinia';
import ChatManyTable from '~/features/chat/components/ChatManyTable.vue';
import { useDeleteChat } from '~/features/chat/composables/useChatApi';
import useChatList from '~/features/chat/composables/useChatList';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

// Props
// Emits

// Refs

// Composables
// A workspace is always active (docs/api-standards/prd.md): activeWorkspaceId
// is only briefly '' on first load, before the workspace list resolves it.
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { page, limit, useGetAllChats } = useChatList(activeWorkspaceId);
const { data, error: chatsError } = useGetAllChats();
const { mutateAsync: deleteChat } = useDeleteChat(activeWorkspaceId);
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
    title: 'Delete Chat',
    message: 'Are you sure you want to delete this chat?',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
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
        {{
          chatsError.message ||
          'An error occurred while fetching the chat history.'
        }}
      </p>
    </div>
    <div v-else>
      <p class="text-sm text-stone-500">Loading chat history...</p>
    </div>
  </SectionWrapper>
</template>
