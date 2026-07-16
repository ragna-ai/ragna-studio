<script setup lang="ts">
import { CalendarIcon, XIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import {
  useGetChatHistory,
  type ChatHistoryItem,
} from '~/features/chat/composables/useChatApi';
import { useSidePanelStore } from '~/stores/sidepanel.store';

// Imports

// Props
// Emits

// Refs
type GroupBy = 'day' | 'month' | 'year';

interface ChatGroup {
  key: string;
  label: string;
  chats: ChatHistoryItem[];
}

const GROUP_BY_CYCLE: GroupBy[] = ['day', 'month', 'year'];

const GROUP_LABEL_FORMATS: Record<GroupBy, Intl.DateTimeFormatOptions> = {
  day: { day: 'numeric', month: 'long' },
  month: { month: 'long', year: 'numeric' },
  year: { year: 'numeric' },
};

// Composables
const sidePanel = useSidePanelStore();
const route = useRoute();
const { t, locale } = useI18n();
const { data, isPending: isLoading } = useGetChatHistory();
const groupBy = useLocalStorage<GroupBy>('chat-history:group-by', 'day');

// Functions
function cycleGroupBy() {
  const nextIndex =
    (GROUP_BY_CYCLE.indexOf(groupBy.value) + 1) % GROUP_BY_CYCLE.length;
  groupBy.value = GROUP_BY_CYCLE[nextIndex]!;
}

function groupKeyFor(updatedAt: string): string {
  if (groupBy.value === 'day') return updatedAt.slice(0, 10);
  if (groupBy.value === 'month') return updatedAt.slice(0, 7);
  return updatedAt.slice(0, 4);
}

// Group keys are partial ISO dates ('2026', '2026-07', or '2026-07-16').
// Pad the missing parts so `Date` always parses a full date, regardless of
// the active grouping.
function dateForGroupKey(key: string): Date {
  const [year, month = '01', day = '01'] = key.split('-');
  return new Date(`${year}-${month}-${day}`);
}

function labelForGroupKey(key: string): string {
  return new Intl.DateTimeFormat(
    locale.value,
    GROUP_LABEL_FORMATS[groupBy.value],
  ).format(dateForGroupKey(key));
}

function isActiveChat(chatId: string): boolean {
  return route.params.chatId === chatId;
}

// Computed
const groups = computed<ChatGroup[]>(() => {
  const chats = data.value?.chats ?? [];

  // Chats arrive newest-first; a Map preserves that order as groups are
  // created on first sight of each key.
  const chatsByKey = new Map<string, ChatHistoryItem[]>();
  for (const chat of chats) {
    const key = groupKeyFor(chat.updatedAt);
    const group = chatsByKey.get(key);
    if (group) {
      group.push(chat);
    } else {
      chatsByKey.set(key, [chat]);
    }
  }

  return Array.from(chatsByKey.entries()).map(([key, groupChats]) => ({
    key,
    label: labelForGroupKey(key),
    chats: groupChats,
  }));
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between gap-1 px-1 pb-2">
      <h2 class="truncate text-sm font-semibold">
        {{ t('chat.history.title') }}
      </h2>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('chat.history.groupBy')"
          :title="t('chat.history.groupBy')"
          @click="cycleGroupBy"
        >
          <CalendarIcon class="size-4 stroke-1.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('chat.history.close')"
          :title="t('chat.history.close')"
          @click="sidePanel.close()"
        >
          <XIcon class="size-4" />
        </Button>
      </div>
    </div>
    <Separator />

    <div v-if="isLoading" class="flex flex-col gap-3 px-2 py-3">
      <div
        v-for="n in 6"
        :key="n"
        class="h-4 w-full animate-pulse rounded bg-stone-200"
      />
    </div>

    <p v-else-if="groups.length === 0" class="px-2 py-3 text-sm text-stone-500">
      {{ t('chat.history.empty') }}
    </p>

    <div v-else class="flex-1 overflow-y-auto">
      <div v-for="group in groups" :key="group.key">
        <div
          class="sticky top-0 truncate bg-stone-50 px-2 py-1 text-xs font-medium text-stone-500"
        >
          {{ group.label }}
        </div>
        <NuxtLinkLocale
          v-for="chat in group.chats"
          :key="chat.id"
          :to="`/chat/${chat.id}`"
          :title="chat.title"
          class="block truncate rounded-md px-2 py-1.5 text-sm hover:bg-stone-100"
          :class="{ 'bg-stone-100 font-medium': isActiveChat(chat.id) }"
        >
          {{ chat.title }}
        </NuxtLinkLocale>
      </div>
    </div>
  </div>
</template>
