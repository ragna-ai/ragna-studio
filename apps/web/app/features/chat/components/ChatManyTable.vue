<script setup lang="ts">
import type { ChatHistoryItem } from '~/features/chat/composables/useChatApi';

// Imports

interface Props {
  chats: ChatHistoryItem[];
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
      <ListEmptyRow v-if="chats.length === 0" :colspan="6">
        {{ $t('chat.history.empty') }}
      </ListEmptyRow>
      <TableRow
        v-for="chat in chats"
        :key="chat.id"
        class="cursor-pointer"
        @click="navigateTo(`/chat/${chat.id}`)"
      >
        <TableCell class="w-12">
          <Icon name="hugeicons:message-multiple-01" class="size-4 text-icon" />
        </TableCell>
        <TableCell>
          <div class="text-body font-medium">
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
          {{ formatDateTime(chat.lastMessageAt) }}
        </TableCell>
        <!-- Actions -->
        <TableCell
          class="flex justify-end space-x-2 text-right whitespace-nowrap"
          @click.stop
        >
          <Button as-child variant="outline" size="icon">
            <NuxtLinkLocale :to="`/chat/${chat.id}`">
              <Icon name="hugeicons:message-01" class="size-4 text-icon" />
            </NuxtLinkLocale>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                :aria-label="t('common.actions')"
              >
                <Icon name="hugeicons:more-vertical" class="size-4 text-icon" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem as-child>
                <NuxtLinkLocale :to="`/chat/${chat.id}`">
                  <Icon name="hugeicons:pencil-edit-02" class="size-4" />
                  {{ t('common.edit') }}
                </NuxtLinkLocale>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="() => emit('delete-chat', chat.id)"
              >
                <Icon name="hugeicons:delete-02" class="size-4" />
                {{ t('common.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
