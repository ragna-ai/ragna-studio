<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import EmailThreadListItem from '~/features/email/components/EmailThreadListItem.vue';
import {
  useSetThreadArchived,
  useSetThreadRead,
  useSetThreadStarred,
  useSetThreadTrashed,
} from '~/features/email/composables/useEmailThreadApi';
import type { EmailCategory, EmailThreadListFilters, EmailThreadSummary } from '~/features/email/types';

// Props
const props = defineProps<{
  threads: EmailThreadSummary[];
  categories: EmailCategory[];
  activeThreadId: string | null;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  filters: EmailThreadListFilters;
  isSearching: boolean;
}>();

// Emits
const emit = defineEmits<{
  open: [string];
  loadMore: [];
}>();

// Composables
const { t } = useI18n();
const filtersRef = computed(() => props.filters);
const { mutate: archiveThread } = useSetThreadArchived(filtersRef);
const { mutate: trashThread } = useSetThreadTrashed(filtersRef);
const { mutate: starThread } = useSetThreadStarred(filtersRef);
const { mutate: setThreadRead } = useSetThreadRead();

// Computed
const categoryById = computed(() => new Map(props.categories.map((category) => [category.id, category])));

function categoryFor(thread: EmailThreadSummary): EmailCategory | null {
  return thread.categoryId ? (categoryById.value.get(thread.categoryId) ?? null) : null;
}
</script>

<template>
  <div class="flex h-full w-96 shrink-0 flex-col border-r">
    <div v-if="props.isLoading" class="flex flex-1 items-center justify-center">
      <Spinner />
    </div>
    <p v-else-if="props.threads.length === 0" class="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {{ props.isSearching ? t('email.thread.noSearchResults') : t('email.thread.empty') }}
    </p>
    <ul v-else class="min-h-0 flex-1 overflow-y-auto">
      <!-- `read` and `isUnread` are opposites of the same flag: the toggle's
           target `read` value is the thread's *current* `isUnread` (not its
           negation) - e.g. isUnread=true means "send read=true" to flip it
           read. Negating here would re-send the thread's current state, a
           silent no-op that looks like the button does nothing. -->
      <EmailThreadListItem
        v-for="thread in props.threads"
        :key="thread.id"
        :thread="thread"
        :category="categoryFor(thread)"
        :is-active="thread.id === props.activeThreadId"
        @open="emit('open', thread.id)"
        @archive="archiveThread({ threadId: thread.id, archived: true })"
        @trash="trashThread({ threadId: thread.id })"
        @star="(value) => starThread({ threadId: thread.id, starred: value })"
        @toggle-read="setThreadRead({ threadId: thread.id, read: thread.isUnread })"
      />
      <div v-if="props.hasNextPage" class="flex justify-center py-4">
        <Button variant="outline" size="sm" :disabled="props.isFetchingNextPage" @click="emit('loadMore')">
          <Spinner v-if="props.isFetchingNextPage" class="mr-2" />
          {{ t('email.thread.loadMore') }}
        </Button>
      </div>
    </ul>
  </div>
</template>
