<script setup lang="ts">
import { MessagesSquareIcon } from '@lucide/vue';
import ChatSearchHighlightedText from '~/features/chat/components/ChatSearchHighlightedText.vue';
import ChatSearchSnippetList from '~/features/chat/components/ChatSearchSnippetList.vue';
import type { ChatSearchResult } from '~/features/chat/composables/useChatSearchApi';
import { chatUrl } from '~/features/chat/lib/chat-navigation';

// Props
interface Props {
  results: ChatSearchResult[];
  query: string;
  meta?: { totalCount: number };
}
defineProps<Props>();

// Composables
const { formatDateTime } = useDateTimeFormat();
const { t } = useI18n();

// Functions
function openChat(chatId: string) {
  navigateTo(chatUrl(chatId));
}
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>&nbsp;</TableHead>
        <TableHead>{{ t('common.title') }}</TableHead>
        <TableHead>{{ t('chat.history.table.agent') }}</TableHead>
        <TableHead class="whitespace-nowrap">
          {{ t('common.model') }}
        </TableHead>
        <TableHead>{{ t('common.updated') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="results.length === 0" :colspan="5">
        {{ t('chat.search.empty') }}
      </TableEmpty>
      <TableRow
        v-for="result in results"
        :key="result.id"
        class="cursor-pointer align-top"
        @click="openChat(result.id)"
      >
        <TableCell class="w-12">
          <MessagesSquareIcon class="size-4 stroke-1.5" />
        </TableCell>
        <TableCell>
          <div class="text-sm font-semibold">
            <ChatSearchHighlightedText :text="result.title" :query="query" />
          </div>
          <ChatSearchSnippetList
            v-if="result.messageSnippets.length > 0"
            :snippets="result.messageSnippets"
            :query="query"
          />
        </TableCell>
        <TableCell class="max-w-40 truncate">
          {{ result.agent.name }}
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ result.agent.aiModel.displayName }}
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ formatDateTime(result.updatedAt) }}
        </TableCell>
      </TableRow>
    </TableBody>
    <TableMetaCaption :itemsLength="results.length" :meta="meta" />
  </Table>
</template>
