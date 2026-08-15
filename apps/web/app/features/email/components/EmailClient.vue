<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import EmailConnectPrompt from '~/features/email/components/EmailConnectPrompt.vue';
import EmailDraftPanel from '~/features/email/components/EmailDraftPanel.vue';
import EmailSidebar from '~/features/email/components/EmailSidebar.vue';
import EmailThreadList from '~/features/email/components/EmailThreadList.vue';
import EmailThreadView from '~/features/email/components/EmailThreadView.vue';
import { useGetEmailAccount } from '~/features/email/composables/useEmailAccountApi';
import { useGetEmailCategories } from '~/features/email/composables/useEmailCategoryApi';
import {
  GMAIL_CONNECT_CALLBACK_PARAM,
  useEmailConnectFlow,
} from '~/features/email/composables/useEmailConnectFlow';
import {
  useCreateEmailDraft,
  useGetEmailDraft,
  useGetPendingDrafts,
} from '~/features/email/composables/useEmailDraftApi';
import { useSearchEmail } from '~/features/email/composables/useEmailSearchApi';
import { useGetEmailThreads } from '~/features/email/composables/useEmailThreadApi';
import { firstQueryValue } from '~/features/email/lib/route-query';
import type {
  EmailFolder,
  EmailThreadListFilters,
  EmailThreadSummary,
} from '~/features/email/types';

// Feature container for /mail (Vue best-practices: route view stays thin,
// composition lives here): owns the connect gate, filters/search state, and
// the three panes, delegating rendering to EmailSidebar/EmailThreadList/
// EmailThreadView. app/pages/mail/index.vue, app/pages/mail/[threadId].vue
// and app/pages/mail/draft/[draftId].vue just forward their route param in
// here - `threadId` and `draftId` are mutually exclusive.
const props = defineProps<{ threadId?: string; draftId?: string }>();

// Composables
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { t } = useI18n();
const { data: accountData, isLoading: isAccountLoading } = useGetEmailAccount();
const { finishConnect } = useEmailConnectFlow();
const { mutateAsync: createDraft, isPending: isCreatingDraft } =
  useCreateEmailDraft();

// Finish the connect flow on return from Google (useEmailConnectFlow.ts).
// finishConnect() already toasts its own error (useEmailConnectFlow.ts's
// connectAccountMutation onError); mutateAsync still rejects afterwards, so
// this catches and swallows it instead of leaving an unhandled rejection.
onMounted(async () => {
  if (route.query[GMAIL_CONNECT_CALLBACK_PARAM] === '1') {
    const { [GMAIL_CONNECT_CALLBACK_PARAM]: _discarded, ...rest } = route.query;
    await router.replace({ query: rest });
    await finishConnect();
  }
});

// Refs
const searchInput = ref('');

// Computed
const isConnected = computed(() => accountData.value?.connected === true);
const account = computed(() => accountData.value?.account ?? null);
const isSearching = computed(() => searchInput.value.trim().length > 0);

// A failed sync (manual or cron) gets its own toast - this is the single
// place that observes the syncing -> settled transition regardless of
// trigger source, so it's the one spot that needs to surface it. Doesn't
// also invalidate threads here: a *fast* sync can finish between two poll
// ticks and never get caught mid-'syncing' at all (same gap
// email-account-sync-poll.ts's lastSyncedAt check exists for), so thread
// invalidation is driven by the lastSyncedAt watcher below instead, which
// catches every completed sync regardless of whether 'syncing' was ever
// observed. A failed sync doesn't move lastSyncedAt, which is exactly why
// the error toast still needs this syncState-based watcher.
watch(
  () => account.value?.syncState,
  (syncState, previousSyncState) => {
    if (previousSyncState === 'syncing' && syncState === 'error') {
      toast.error(t('email.sync.syncFailed'));
    }
  },
);

// New mail may have landed whenever lastSyncedAt actually advances -
// covers cron syncs and every manual sync (slow or fast), all in one
// place, without needing to know anything about syncState timing.
watch(
  () => account.value?.lastSyncedAt,
  (lastSyncedAt, previousLastSyncedAt) => {
    // `previousLastSyncedAt === undefined` is the initial account-data
    // arrival (nothing to invalidate yet, not a completed sync).
    if (
      previousLastSyncedAt === undefined ||
      lastSyncedAt === previousLastSyncedAt
    )
      return;
    queryClient.invalidateQueries({ queryKey: ['email', 'threads'] });
  },
);

const folder = computed<EmailFolder>(
  () => (firstQueryValue(route.query.folder) as EmailFolder | null) ?? 'inbox',
);
const categoryId = computed(() => firstQueryValue(route.query.categoryId));
const labelId = computed(() => firstQueryValue(route.query.labelId));

const filters = computed<EmailThreadListFilters>(() => ({
  folder: categoryId.value || labelId.value ? null : folder.value,
  categoryId: categoryId.value,
  labelId: labelId.value,
}));

const threadsQuery = useGetEmailThreads(filters);
const searchResult = useSearchEmail(searchInput);
const categoriesQuery = useGetEmailCategories();
const pendingDraftsQuery = useGetPendingDrafts();

// `/mail/draft/:draftId` (new mail, no thread below it - see the entry
// points table in docs/email/drafts-change-request.md, section 2). Only
// fetches once a draftId is actually being viewed; a 404 (draft already
// sent/discarded elsewhere) surfaces as `standaloneDraftQuery.isError`,
// rendered as a "not found" message rather than an error toast.
const isDraftRoute = computed(() => !!props.draftId);
const standaloneDraftId = computed(() => props.draftId ?? null);
const standaloneDraftQuery = useGetEmailDraft(standaloneDraftId);
const standaloneDraft = computed(
  () => standaloneDraftQuery.data.value?.draft ?? null,
);

const listThreads = computed<EmailThreadSummary[]>(() => {
  if (isSearching.value) return searchResult.data.value?.threads ?? [];
  return threadsQuery.data.value?.pages.flatMap((page) => page.threads) ?? [];
});

// Read-only Gmail label filters, derived from whatever labels appear on the
// currently loaded threads (docs/email/prd.md: "read-only Gmail label
// filters (from thread data)" - there is no label-listing endpoint). Common
// system labels are excluded since folders/starred/unread already cover
// them and a raw "INBOX"/"UNREAD" chip would just duplicate the folder list.
const SYSTEM_LABEL_DENYLIST = new Set([
  'INBOX',
  'SENT',
  'TRASH',
  'SPAM',
  'DRAFT',
  'UNREAD',
  'STARRED',
  'IMPORTANT',
  'CATEGORY_PERSONAL',
]);
const availableLabels = computed(() => {
  const pages = threadsQuery.data.value?.pages ?? [];
  const labels = new Set<string>();
  for (const page of pages) {
    for (const thread of page.threads) {
      for (const labelId of thread.labelIds) {
        if (!SYSTEM_LABEL_DENYLIST.has(labelId)) labels.add(labelId);
      }
    }
  }
  return Array.from(labels).sort();
});

const pendingDraftsCount = computed(
  () => pendingDraftsQuery.data.value?.drafts.length ?? 0,
);

// Functions
function pushFilterQuery(query: Record<string, string>) {
  router.push({ path: '/mail', query });
}

function selectFolder(next: EmailFolder) {
  searchInput.value = '';
  pushFilterQuery({ folder: next });
}

function selectCategory(id: string | null) {
  searchInput.value = '';
  pushFilterQuery(id ? { categoryId: id } : {});
}

function selectLabel(id: string | null) {
  searchInput.value = '';
  pushFilterQuery(id ? { labelId: id } : {});
}

function handleSearch(query: string) {
  searchInput.value = query;
}

function openThread(id: string) {
  router.push({ path: `/mail/${id}`, query: route.query });
}

function loadMoreThreads() {
  if (threadsQuery.hasNextPage.value) threadsQuery.fetchNextPage();
}

// Compose creates the local draft row up front (docs/email/drafts-change-request.md,
// "Creation timing"), then routes to its own page - EmailDraftPanel is the
// only surface that ever renders it, there's no more modal to open here. A
// `kind: 'new'` draft carries no `threadId`, so it can never hit the
// one-active-draft-per-thread 409; the catch here only stops a failed
// create (already toasted by the mutation's onError) from also surfacing as
// an unhandled promise rejection.
async function handleCompose() {
  try {
    const { draft } = await createDraft({ kind: 'new' });
    router.push({ path: `/mail/draft/${draft.id}` });
  } catch {
    // Already toasted by the mutation's onError.
  }
}
</script>

<template>
  <div v-if="isAccountLoading" class="flex h-full items-center justify-center">
    <Spinner />
  </div>
  <EmailConnectPrompt v-else-if="!isConnected" />
  <div v-else class="flex h-full min-h-0">
    <!-- Sidebar -->
    <EmailSidebar
      v-if="account"
      :account="account"
      :categories="categoriesQuery.data.value?.categories ?? []"
      :labels="availableLabels"
      :folder="filters.folder"
      :category-id="filters.categoryId"
      :label-id="filters.labelId"
      :is-searching="isSearching"
      :pending-drafts-count="pendingDraftsCount"
      :is-composing="isCreatingDraft"
      @compose="handleCompose"
      @search="handleSearch"
      @select-folder="selectFolder"
      @select-category="selectCategory"
      @select-label="selectLabel"
    />
    <!-- Thread list -->
    <EmailThreadList
      :threads="listThreads"
      :categories="categoriesQuery.data.value?.categories ?? []"
      :active-thread-id="props.threadId ?? null"
      :is-loading="
        isSearching
          ? searchResult.isLoading.value
          : threadsQuery.isLoading.value
      "
      :is-fetching-next-page="threadsQuery.isFetchingNextPage.value"
      :has-next-page="!isSearching && (threadsQuery.hasNextPage.value ?? false)"
      :filters="filters"
      :is-searching="isSearching"
      @open="openThread"
      @load-more="loadMoreThreads"
    />
    <!-- Thread view -->
    <EmailThreadView
      v-if="props.threadId"
      :thread-id="props.threadId"
      :filters="filters"
    />
    <!-- Draft view if draft-only route -->
    <div v-else-if="isDraftRoute" class="flex min-h-0 flex-1 flex-col">
      <div
        v-if="standaloneDraftQuery.isLoading.value"
        class="flex flex-1 items-center justify-center"
      >
        <Spinner />
      </div>
      <p
        v-else-if="standaloneDraftQuery.isError.value || !standaloneDraft"
        class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        {{ t('email.draft.notFound') }}
      </p>
      <EmailDraftPanel v-else :draft="standaloneDraft" />
    </div>
    <div
      v-else
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      {{ t('email.thread.selectPrompt') }}
    </div>
  </div>
</template>
