<script setup lang="ts">
import ChatSearchHighlightedText from '~/features/chat/components/ChatSearchHighlightedText.vue';
import ChatSearchSnippetList from '~/features/chat/components/ChatSearchSnippetList.vue';
import type { ChatSearchResult } from '~/features/chat/composables/useChatSearchApi';
import { chatUrl } from '~/features/chat/lib/chat-navigation';

// Props
interface Props {
  results: ChatSearchResult[];
  query: string;
  isLoading?: boolean;
}
defineProps<Props>();

// Composables
const { formatDateTime } = useDateTimeFormat();
const { t } = useI18n();
</script>

<template>
  <ListTable>
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead class="w-10">
          <span class="sr-only">{{ t('common.title') }}</span>
        </TableHead>
        <TableHead>{{ t('common.title') }}</TableHead>
        <TableHead class="w-40">{{ t('chat.history.table.agent') }}</TableHead>
        <TableHead class="w-40">{{ t('common.model') }}</TableHead>
        <TableHead class="w-45">{{ t('common.updated') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <ListSkeletonRows
        v-if="isLoading"
        :columns="['none', 'title', 'bar', 'bar', 'bar']"
      />
      <ListEmptyRow v-else-if="results.length === 0" :colspan="5">
        {{ t('chat.search.empty') }}
      </ListEmptyRow>
      <template v-else>
        <TableRow
          v-for="result in results"
          :key="result.id"
          class="relative cursor-pointer align-top"
        >
          <TableCell>
            <!-- Stretched link: the row is `relative`, so this anchor covers it and gives real `<a>` semantics. -->
            <NuxtLinkLocale
              :to="chatUrl(result.id)"
              :aria-label="result.title"
              class="absolute inset-0 z-10"
            />
            <Icon
              name="hugeicons:message-multiple-01"
              class="size-4 text-icon"
            />
          </TableCell>
          <TableCell class="min-w-0">
            <div class="truncate text-body font-medium">
              <ChatSearchHighlightedText :text="result.title" :query="query" />
            </div>
            <ChatSearchSnippetList
              v-if="result.messageSnippets.length > 0"
              :snippets="result.messageSnippets"
              :query="query"
            />
          </TableCell>
          <TableCell class="truncate">
            {{ result.agent.name }}
          </TableCell>
          <TableCell class="truncate">
            {{ result.agent.aiModel.displayName }}
          </TableCell>
          <TableCell class="text-small text-muted-foreground">
            {{ formatDateTime(result.updatedAt) }}
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </ListTable>
</template>
