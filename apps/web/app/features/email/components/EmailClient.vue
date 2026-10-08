<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import EmailConnectPrompt from '~/features/email/components/EmailConnectPrompt.vue';
import EmailDraftList from '~/features/email/components/EmailDraftList.vue';
import EmailDraftPanel from '~/features/email/components/EmailDraftPanel.vue';
import EmailSidebar from '~/features/email/components/EmailSidebar.vue';
import EmailThreadList from '~/features/email/components/EmailThreadList.vue';
import EmailThreadView from '~/features/email/components/EmailThreadView.vue';
import { useGetEmailAccount } from '~/features/email/composables/useEmailAccountApi';
import { useGetEmailCategories } from '~/features/email/composables/useEmailCategoryApi';
import {
  MAIL_CONNECT_CALLBACK_PARAM,
  MAIL_RECONNECT_CALLBACK_PARAM,
  useEmailConnectFlow,
} from '~/features/email/composables/useEmailConnectFlow';
import {
  useCreateEmailDraft,
  useGetAllDrafts,
  useGetEmailDraft,
} from '~/features/email/composables/useEmailDraftApi';
import { useSearchEmail } from '~/features/email/composables/useEmailSearchApi';
import { useGetEmailThreads } from '~/features/email/composables/useEmailThreadApi';
import { firstQueryValue } from '~/features/email/lib/route-query';
import {
  isEmailProviderKind,
  type EmailDraft,
  type EmailFolder,
  type EmailThreadListFilters,
  type EmailThreadSummary,
} from '~/features/email/types';

// Feature container for /mail (Vue best-practices: route view stays thin,
// composition lives here): owns the connect gate, filters/search state, and
// the three panes, delegating rendering to EmailSidebar/EmailThreadList/
// EmailThreadView. app/pages/mail/[[threadId]].vue (one route record for
// both /mail and /mail/:threadId, so opening a thread updates this
// component's prop instead of unmounting/remounting it - that page-boundary
// remount used to reset EmailThreadList's scroll position on every open) and
// app/pages/mail/draft/[draftId].vue just forward their route param in here -
// `threadId` and `draftId` are mutually exclusive.
const props = defineProps<{ threadId?: string; draftId?: string }>();

// Composables
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { t } = useI18n();
const { data: accountData, isLoading: isAccountLoading } = useGetEmailAccount();
const { finishConnect, finishReconnect } = useEmailConnectFlow();
const { mutateAsync: createDraft, isPending: isCreatingDraft } =
  useCreateEmailDraft();

// Finish the connect/reconnect flow on return from the OAuth provider
// (useEmailConnectFlow.ts). Both finish*() calls already toast their own
// error; mutateAsync still rejects afterwards, so this catches and swallows
// it instead of leaving an unhandled rejection.
onMounted(async () => {
  try {
    const connectProvider = firstQueryValue(
      route.query[MAIL_CONNECT_CALLBACK_PARAM],
    );
    const reconnectProvider = firstQueryValue(
      route.query[MAIL_RECONNECT_CALLBACK_PARAM],
    );
    if (connectProvider && isEmailProviderKind(connectProvider)) {
      const { [MAIL_CONNECT_CALLBACK_PARAM]: _discarded, ...rest } =
        route.query;
      await router.replace({ query: rest });
      await finishConnect(connectProvider);
    } else if (reconnectProvider && isEmailProviderKind(reconnectProvider)) {
      const { [MAIL_RECONNECT_CALLBACK_PARAM]: _discarded, ...rest } =
        route.query;
      await router.replace({ query: rest });
      await finishReconnect(reconnectProvider);
    }
  } catch {
    // Already toasted by useEmailConnectFlow.ts's own mutation onError.
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
//
// 'reauth_required' gets its own toast on every transition into it (not
// gated on `previousSyncState === 'syncing'` like the plain error case):
// email-sync.service.ts can set it straight from an 'idle' cron tick, not
// just off a user-observed 'syncing' state.
watch(
  () => account.value?.syncState,
  (syncState, previousSyncState) => {
    if (previousSyncState === 'syncing' && syncState === 'error') {
      toast.error(t('email.sync.syncFailed'));
    } else if (
      syncState === 'reauth_required' &&
      previousSyncState !== 'reauth_required'
    ) {
      toast.error(t('email.sync.reauthRequiredToast'));
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

const folderQuery = computed(() => firstQueryValue(route.query.folder));
const categoryId = computed(() => firstQueryValue(route.query.categoryId));
const labelId = computed(() => firstQueryValue(route.query.labelId));
const unreadOnly = computed(() => firstQueryValue(route.query.unread) === '1');
const starredOnly = computed(
  () => firstQueryValue(route.query.starred) === '1',
);
const dateFrom = computed(() => firstQueryValue(route.query.dateFrom));
const dateTo = computed(() => firstQueryValue(route.query.dateTo));

// Drafts is a client-only pseudo-folder: `?folder=drafts` selects it exactly
// like any other EMAIL_FOLDERS value (same query-param mechanism, same list +
// reading-pane layout, no navigation to a different page), but it isn't part
// of the server-validated `EmailFolder`/emailFolderEnum, so it never reaches
// `filters.folder` - the thread-list query is skipped entirely while active
// and the row data comes from `useGetAllDrafts` instead.
const isDraftsView = computed(
  () =>
    folderQuery.value === 'drafts' &&
    !categoryId.value &&
    !labelId.value &&
    !isSearching.value,
);

const folder = computed<EmailFolder | null>(() => {
  if (isDraftsView.value) return null;
  return (folderQuery.value as EmailFolder | null) ?? 'inbox';
});

const filters = computed<EmailThreadListFilters>(() => ({
  folder: categoryId.value || labelId.value ? null : folder.value,
  categoryId: categoryId.value,
  labelId: labelId.value,
  unreadOnly: unreadOnly.value,
  starredOnly: starredOnly.value,
  dateFrom: dateFrom.value,
  dateTo: dateTo.value,
}));

const threadsQuery = useGetEmailThreads(filters, () => !isDraftsView.value);
const searchResult = useSearchEmail(searchInput);
const categoriesQuery = useGetEmailCategories();
// Always fetched (not just in drafts view): also drives the sidebar count and
// the per-thread "Draft" indicator badge in every other folder.
const allDraftsQuery = useGetAllDrafts();

// `/mail/draft/:draftId` (new mail, no thread below it). Only
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

// Read-only label filters, derived from whatever labels appear on the
// currently loaded threads (there is no label-listing endpoint). Gmail's
// system labels are excluded since folders/starred/unread already cover
// them; Outlook's labelIds are category display names, so all of them show.
const GMAIL_SYSTEM_LABEL_DENYLIST = new Set([
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
  const isGmail = account.value?.provider === 'gmail';
  const labels = new Set<string>();
  for (const page of pages) {
    for (const thread of page.threads) {
      for (const labelId of thread.labelIds) {
        if (isGmail && GMAIL_SYSTEM_LABEL_DENYLIST.has(labelId)) continue;
        labels.add(labelId);
      }
    }
  }
  return Array.from(labels).sort();
});

const allDrafts = computed<EmailDraft[]>(
  () => allDraftsQuery.data.value?.drafts ?? [],
);
const pendingDraftsCount = computed(() => allDrafts.value.length);

// Functions
function pushFilterQuery(query: Record<string, string>) {
  router.push({ path: '/mail', query });
}

interface QuickFilterOverrides {
  unreadOnly?: boolean;
  starredOnly?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
}

// unread/starred/dateFrom/dateTo AND on top of whichever folder/category/
// label is selected, so every navigation (which replaces the whole query)
// has to re-include them explicitly, applying any single-field override.
function buildFilterQuery(
  selection: Record<string, string>,
  overrides: QuickFilterOverrides = {},
): Record<string, string> {
  const nextUnread = overrides.unreadOnly ?? unreadOnly.value;
  const nextStarred = overrides.starredOnly ?? starredOnly.value;
  const nextDateFrom =
    overrides.dateFrom !== undefined ? overrides.dateFrom : dateFrom.value;
  const nextDateTo =
    overrides.dateTo !== undefined ? overrides.dateTo : dateTo.value;

  return {
    ...selection,
    ...(nextUnread ? { unread: '1' } : {}),
    ...(nextStarred ? { starred: '1' } : {}),
    ...(nextDateFrom ? { dateFrom: nextDateFrom } : {}),
    ...(nextDateTo ? { dateTo: nextDateTo } : {}),
  };
}

function currentSelectionQuery(): Record<string, string> {
  if (categoryId.value) return { categoryId: categoryId.value };
  if (labelId.value) return { labelId: labelId.value };
  if (folderQuery.value) return { folder: folderQuery.value };
  return {};
}

function selectFolder(next: EmailFolder) {
  searchInput.value = '';
  pushFilterQuery(buildFilterQuery({ folder: next }));
}

function selectDrafts() {
  searchInput.value = '';
  pushFilterQuery(buildFilterQuery({ folder: 'drafts' }));
}

function selectCategory(id: string | null) {
  searchInput.value = '';
  pushFilterQuery(buildFilterQuery(id ? { categoryId: id } : {}));
}

function selectLabel(id: string | null) {
  searchInput.value = '';
  pushFilterQuery(buildFilterQuery(id ? { labelId: id } : {}));
}

function toggleUnreadOnly() {
  pushFilterQuery(
    buildFilterQuery(currentSelectionQuery(), {
      unreadOnly: !unreadOnly.value,
    }),
  );
}

function toggleStarredOnly() {
  pushFilterQuery(
    buildFilterQuery(currentSelectionQuery(), {
      starredOnly: !starredOnly.value,
    }),
  );
}

function setDateFrom(value: string | null) {
  pushFilterQuery(
    buildFilterQuery(currentSelectionQuery(), { dateFrom: value }),
  );
}

function setDateTo(value: string | null) {
  pushFilterQuery(buildFilterQuery(currentSelectionQuery(), { dateTo: value }));
}

function handleSearch(query: string) {
  searchInput.value = query;
}

function openThread(id: string) {
  router.push({ path: `/mail/${id}`, query: route.query });
}

/** A draft with a thread opens the thread view (EmailDraftPanel renders inline there, same as today); a threadless ('new') draft opens its own standalone route. */
function openDraft(draft: EmailDraft) {
  const path = draft.threadId
    ? `/mail/${draft.threadId}`
    : `/mail/draft/${draft.id}`;
  router.push({ path, query: route.query });
}

function loadMoreThreads() {
  if (threadsQuery.hasNextPage.value) threadsQuery.fetchNextPage();
}

// Compose creates the local draft row up front,
// then routes to its own page - EmailDraftPanel is the
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
      :is-drafts-view="isDraftsView"
      :pending-drafts-count="pendingDraftsCount"
      :is-composing="isCreatingDraft"
      @compose="handleCompose"
      @search="handleSearch"
      @select-folder="selectFolder"
      @select-drafts="selectDrafts"
      @select-category="selectCategory"
      @select-label="selectLabel"
    />
    <!-- Drafts pseudo-folder list -->
    <EmailDraftList
      v-if="isDraftsView"
      :drafts="allDrafts"
      :active-draft-id="props.draftId ?? null"
      :active-thread-id="props.threadId ?? null"
      :is-loading="allDraftsQuery.isLoading.value"
      @open="openDraft"
    />
    <!-- Thread list -->
    <EmailThreadList
      v-else
      :threads="listThreads"
      :categories="categoriesQuery.data.value?.categories ?? []"
      :drafts="allDrafts"
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
      @toggle-unread-only="toggleUnreadOnly"
      @toggle-starred-only="toggleStarredOnly"
      @update-date-from="setDateFrom"
      @update-date-to="setDateTo"
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
