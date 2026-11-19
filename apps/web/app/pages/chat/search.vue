<script setup lang="ts">
import { storeToRefs } from 'pinia';
import ChatSearchResultsTable from '~/features/chat/components/ChatSearchResultsTable.vue';
import { useChatSearchApi } from '~/features/chat/composables/useChatSearchApi';
import {
  parseChatSearchQuery,
  type ChatSearchQuery,
} from '~/features/chat/lib/chat-search-query';
import { useChatSearchSettingsStore } from '~/features/chat/stores/chatsearchsettings.store';
import { cn } from '~/lib/utils';

// Props
// Emits

// Refs
const route = useRoute();
const router = useRouter();
// The URL is the single source of truth, so a new `?q=` (sidebar search,
// back/forward) re-runs the search. A malformed/tampered query string falls
// back to defaults.
const searchState = computed(() => parseChatSearchQuery(route.query));
const searchInput = ref(searchState.value.q);
const searchInputRef =
  useTemplateRef<ComponentPublicInstance>('searchInputRef');

// Writes within one tick are merged into a single `replace`: `route.query`
// only updates after navigation, so separate calls would overwrite each other.
// `replace`, not `push`, so neither keystrokes nor paging pile up history entries.
let pendingQueryPatch: Partial<ChatSearchQuery> = {};
function updateSearchQuery(patch: Partial<ChatSearchQuery>) {
  const isFirstPatch = Object.keys(pendingQueryPatch).length === 0;
  pendingQueryPatch = { ...pendingQueryPatch, ...patch };
  if (!isFirstPatch) return;
  queueMicrotask(() => {
    const merged = { ...searchState.value, ...pendingQueryPatch };
    pendingQueryPatch = {};
    router.replace({
      query: {
        ...route.query,
        q: merged.q || undefined,
        page: merged.page,
        limit: merged.limit,
      },
    });
  });
}

const query = computed(() => searchState.value.q);
const page = computed({
  get: () => searchState.value.page,
  set: (value) => updateSearchQuery({ page: value }),
});
// `limit` is always sent explicitly, and `ListPagination`' page-size `Select` only
// offers 10/25/50/100. A value outside that list (e.g. 20) leaves the select
// bound to a value with no matching `SelectItem`, which Radix/shadcn renders blank.
const limit = computed({
  get: () => searchState.value.limit,
  set: (value) => updateSearchQuery({ limit: value }),
});
// Snippets-per-chat-row is a fixed v1 default,
// independent of the page/limit pagination above.
const snippetsPerChat = ref(3);

// Composables
const { t } = useI18n();
const { caseSensitive } = storeToRefs(useChatSearchSettingsStore());
const { data, isLoading, isFetching, error, refetch } = useChatSearchApi({
  query,
  page,
  limit,
  snippetsPerChat,
  caseSensitive,
});

useHead({
  title: t('chat.search.title'),
});

// Computed
const meta = computed(() => ({ totalCount: data.value?.totalCount ?? 0 }));

// Functions
const applySearch = useDebounceFn((value: string) => {
  if (value.trim() === query.value) return;
  updateSearchQuery({ q: value.trim(), page: 1 }); // new search starts on page 1
}, 250);

function toggleCaseSensitive() {
  caseSensitive.value = !caseSensitive.value;
}

function clearSearch() {
  searchInput.value = '';
  updateSearchQuery({ q: '', page: 1 });
}

// Hooks
onMounted(() => {
  const input = searchInputRef.value?.$el;
  if (!(input instanceof HTMLInputElement)) return;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
});
watch(searchInput, applySearch);
watch(caseSensitive, () => {
  page.value = 1; // reset to first page, same as a new search
});

// Keeps the input in sync when the URL changes elsewhere; the trim check
// avoids undoing a trailing space the user just typed.
watch(query, (q) => {
  if (searchInput.value.trim() !== q) searchInput.value = q;
});
</script>

<template>
  <PagePanel>
    <SectionWrapper>
      <Heading>
        <template #top>
          <HeadingTitle
            :title="t('chat.search.title')"
            :subtitle="t('chat.search.subtitle')"
          />
        </template>
      </Heading>

      <div class="space-y-4 px-page pt-6">
        <div class="relative mx-auto max-w-xl">
          <Icon
            name="hugeicons:search-01"
            class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-icon"
          />
          <Input
            ref="searchInputRef"
            v-model="searchInput"
            class="h-11 py-2.5 pr-[4.5rem] pl-9"
            :placeholder="t('chat.search.placeholder')"
          />
          <!-- Inline icon toggles docked in the input's right edge, VSCode
             search-widget style. Clear + case-sensitive today, but this
             wrapper is where a later whole-word/regex toggle would go next
             to them. `top-1/2 -translate-y-1/2` centers relative to this
             wrapper's own height, so it tracks the input's taller `h-11`
             automatically. -->
          <div
            class="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5"
          >
            <Button
              v-if="searchInput"
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="t('chat.search.clear')"
              @click="clearSearch"
            >
              <Icon
                name="hugeicons:cancel-01"
                class="size-4 shrink-0 text-icon"
              />
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :class="cn(caseSensitive && 'border-primary bg-primary/10')"
                    :aria-label="t('chat.search.caseSensitive')"
                    :aria-pressed="caseSensitive"
                    @click="toggleCaseSensitive"
                  >
                    <Icon
                      name="hugeicons:case-sensitive"
                      class="size-4 shrink-0 text-icon"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ t('chat.search.caseSensitive') }}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <!-- No length gate needed here: `useChatSearchApi`'s `placeholderData`
           already resolves to an empty result set (not stale data) once the
           query drops below the enabled threshold, so this renders the
           table's normal empty state rather than leftover results. -->
        <ListErrorAlert
          v-if="error && !data"
          :title="t('chat.search.loadError.title')"
          :description="t('chat.search.loadError.description')"
          @retry="refetch()"
        />
        <template v-else>
          <ChatSearchResultsTable
            :results="data?.results ?? []"
            :query="query"
            :is-loading="isLoading"
            :class="{ 'opacity-60': isFetching }"
          />
          <div v-if="data && data.results.length > 0" class="pb-10">
            <ListPagination
              v-model:page="page"
              v-model:limit="limit"
              :total-count="meta.totalCount"
              noun="chat.history.count"
            />
          </div>
        </template>
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
