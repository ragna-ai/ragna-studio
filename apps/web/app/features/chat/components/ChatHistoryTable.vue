<script setup lang="ts">
import {
  MessageCircleMoreIcon,
  MessagesSquareIcon,
  Trash2Icon,
} from '@lucide/vue';
import type { ChatHistoryItem } from '~/features/chat/composables/useChatApi';

// Imports

interface Props {
  chats: ChatHistoryItem[];
  meta?: { totalCount: number };
}

// Props
defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'delete-chat', chatId: string): void;
}>();

// Refs

// Composables

// Computed

// Functions
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDateTime(isoDate: string) {
  return dateTimeFormatter.format(new Date(isoDate));
}

// Hooks
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>&nbsp;</TableHead>
        <TableHead>{{ $t('table.title') }}</TableHead>
        <TableHead>{{ $t('table.ai_agent') }}</TableHead>
        <TableHead class="whitespace-nowrap">
          {{ $t('table.ai_model') }}
        </TableHead>
        <TableHead>{{ $t('table.updated_at') }}</TableHead>
        <TableHead class="text-right">{{ $t('table.actions') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="chats.length === 0" :colspan="6">
        {{ $t('chat.history.empty') }}
      </TableEmpty>
      <TableRow v-for="chat in chats" :key="chat.id">
        <TableCell class="w-12">
          <MessagesSquareIcon class="size-4 stroke-1.5" />
        </TableCell>
        <TableCell>
          <div class="text-sm font-semibold">
            {{ chat.title }}
          </div>
        </TableCell>
        <TableCell class="max-w-40 truncate">
          {{ chat.agent.name }}
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ chat.agent.aiModel.displayName }}
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ formatDateTime(chat.updatedAt) }}
        </TableCell>
        <TableCell class="space-x-2 text-right whitespace-nowrap">
          <Button as-child variant="outline" size="icon">
            <NuxtLinkLocale :to="`/chat/${chat.id}`">
              <MessageCircleMoreIcon class="size-4 stroke-1.5 text-primary" />
            </NuxtLinkLocale>
          </Button>

          <Button
            variant="outline"
            size="icon"
            @click="() => emit('delete-chat', chat.id)"
          >
            <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
          </Button>
        </TableCell>
      </TableRow>
    </TableBody>
    <!-- Meta Caption -->
    <TableMetaCaption :itemsLength="chats.length" :meta="meta" />
  </Table>
</template>
