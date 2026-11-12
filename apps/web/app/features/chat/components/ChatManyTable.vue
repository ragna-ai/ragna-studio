<script setup lang="ts">
import AgentMark from '~/features/agent/components/AgentMark.vue';
import type { ChatHistoryItem } from '~/features/chat/composables/useChatApi';

// Imports

interface Props {
  chats: ChatHistoryItem[];
  isLoading: boolean;
}

// Props
defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'rename-chat', chat: ChatHistoryItem): void;
  (e: 'delete-chat', chatId: string): void;
}>();

// Composables
const { formatRelative } = useDateTimeFormat();
const { t } = useI18n();

// Functions
function chatPath(chat: ChatHistoryItem): string {
  return `/chat/${chat.id}`;
}
</script>

<template>
  <ListTable>
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead>{{ t('chat.history.table.chat') }}</TableHead>
        <TableHead class="w-55">{{ t('chat.history.table.agent') }}</TableHead>
        <TableHead class="w-35 text-right">
          {{ t('chat.history.table.lastMessage') }}
        </TableHead>
        <TableHead class="w-10">
          <span class="sr-only">{{ t('common.actions') }}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <ListSkeletonRows
        v-if="isLoading"
        :columns="['bar', 'bar', 'bar', 'none']"
      />
      <template v-else>
        <TableRow
          v-for="chat in chats"
          :key="chat.id"
          class="cursor-pointer"
          @click="navigateTo(chatPath(chat))"
        >
          <TableCell>
            <ListTitleCell :title="chat.title" :to="chatPath(chat)" />
          </TableCell>
          <TableCell>
            <div class="flex min-w-0 items-center gap-2">
              <AgentMark :agent-id="chat.agent.id" :size="20" />
              <span class="truncate text-small">{{ chat.agent.name }}</span>
            </div>
          </TableCell>
          <TableCell class="text-right text-small text-muted-foreground">
            {{ formatRelative(chat.lastMessageAt) }}
          </TableCell>
          <TableCell>
            <ListRowActions>
              <DropdownMenuItem @click="emit('rename-chat', chat)">
                <Icon name="hugeicons:pencil-edit-02" />
                {{ t('chat.history.rename') }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="emit('delete-chat', chat.id)"
              >
                <Icon name="hugeicons:delete-02" />
                {{ t('common.delete') }}
              </DropdownMenuItem>
            </ListRowActions>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </ListTable>
</template>
