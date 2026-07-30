<script setup lang="ts">
import {
  MessageCircleMoreIcon,
  MessagesSquareIcon,
  MoreVerticalIcon,
  PencilIcon,
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
const { formatDateTime } = useDateTimeFormat();
const { t } = useI18n();

// Computed

// Functions

// Hooks
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
        <TableHead class="text-right">{{ t('common.actions') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="chats.length === 0" :colspan="6">
        {{ $t('chat.history.empty') }}
      </TableEmpty>
      <TableRow
        v-for="chat in chats"
        :key="chat.id"
        class="cursor-pointer"
        @click="navigateTo(`/chat/${chat.id}`)"
      >
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
        <!-- Actions -->
        <TableCell
          class="flex justify-end space-x-2 text-right whitespace-nowrap"
          @click.stop
        >
          <Button as-child variant="outline" size="icon">
            <NuxtLinkLocale :to="`/chat/${chat.id}`">
              <MessageCircleMoreIcon class="size-4 stroke-1.5 text-primary" />
            </NuxtLinkLocale>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="icon" :aria-label="t('common.actions')">
                <MoreVerticalIcon class="size-4 stroke-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem as-child>
                <NuxtLinkLocale :to="`/chat/${chat.id}`">
                  <PencilIcon class="size-4 stroke-1.5" />
                  {{ t('common.edit') }}
                </NuxtLinkLocale>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="() => emit('delete-chat', chat.id)"
              >
                <Trash2Icon class="size-4 stroke-1.5" />
                {{ t('common.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    </TableBody>
    <!-- Meta Caption -->
    <TableMetaCaption :itemsLength="chats.length" :meta="meta" />
  </Table>
</template>
