<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import EmailThreadListFilterBar from '~/features/email/components/EmailThreadListFilterBar.vue';
import EmailThreadListItem from '~/features/email/components/EmailThreadListItem.vue';
import {
  useSetThreadArchived,
  useSetThreadRead,
  useSetThreadStarred,
  useSetThreadTrashed,
} from '~/features/email/composables/useEmailThreadApi';
import type { EmailCategory, EmailDraft, EmailThreadListFilters, EmailThreadSummary } from '~/features/email/types';

// Props
const props = defineProps<{
  threads: EmailThreadSummary[];
  categories: EmailCategory[];
  /** Every active draft on the account, for the per-row "Draft" indicator - not filtered to this list's threads. */
  drafts: EmailDraft[];
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
  toggleUnreadOnly: [];
  toggleStarredOnly: [];
  updateDateFrom: [string | null];
  updateDateTo: [string | null];
}>();

// Composables
const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const filtersRef = computed(() => props.filters);
const { mutate: archiveThread } = useSetThreadArchived(filtersRef);
const { mutate: trashThread } = useSetThreadTrashed(filtersRef);
const { mutate: starThread } = useSetThreadStarred(filtersRef);
const { mutate: setThreadRead } = useSetThreadRead();

// Archiving/trashing a row removes it from this list optimistically, but if
// that row is also the thread currently open in the reading pane
// (EmailThreadView, driven by the route's threadId), nothing else tells the
// route to move on - the pane would otherwise keep rendering a thread that
// no longer appears anywhere in the list. Mirrors EmailThreadView's own
// trash/archive buttons, which already navigate back to `/mail` on click.
function closeIfActive(threadId: string) {
  if (threadId === props.activeThreadId) {
    router.push({ path: '/mail', query: { ...route.query } });
  }
}

function handleArchive(threadId: string) {
  archiveThread({ threadId, archived: true });
  closeIfActive(threadId);
}

function handleTrash(threadId: string, trashed: boolean) {
  trashThread({ threadId, trashed });
  closeIfActive(threadId);
}

// Computed
const categoryById = computed(() => new Map(props.categories.map((category) => [category.id, category])));
const draftByThreadId = computed(
  () => new Map(props.drafts.filter((draft) => draft.threadId !== null).map((draft) => [draft.threadId as string, draft])),
);

function categoryFor(thread: EmailThreadSummary): EmailCategory | null {
  return thread.categoryId ? (categoryById.value.get(thread.categoryId) ?? null) : null;
}

function draftFor(thread: EmailThreadSummary): EmailDraft | null {
  return draftByThreadId.value.get(thread.id) ?? null;
}
</script>

<template>
  <div class="flex h-full w-96 shrink-0 flex-col border-r">
    <EmailThreadListFilterBar
      v-if="!props.isSearching"
      :unread-only="props.filters.unreadOnly"
      :starred-only="props.filters.starredOnly"
      :date-from="props.filters.dateFrom"
      :date-to="props.filters.dateTo"
      @toggle-unread-only="emit('toggleUnreadOnly')"
      @toggle-starred-only="emit('toggleStarredOnly')"
      @update-date-from="emit('updateDateFrom', $event)"
      @update-date-to="emit('updateDateTo', $event)"
    />
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
        :draft="draftFor(thread)"
        :is-active="thread.id === props.activeThreadId"
        :is-trashed-folder="props.filters.folder === 'trashed'"
        @open="emit('open', thread.id)"
        @archive="handleArchive(thread.id)"
        @trash="(trashed) => handleTrash(thread.id, trashed)"
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
