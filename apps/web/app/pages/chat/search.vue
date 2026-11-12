<script setup lang="ts">
import { storeToRefs } from 'pinia';
import ChatSearchResultsTable from '~/features/chat/components/ChatSearchResultsTable.vue';
import { useChatSearchApi } from '~/features/chat/composables/useChatSearchApi';
import { parseChatSearchQuery } from '~/features/chat/lib/chat-search-query';
import { useChatSearchSettingsStore } from '~/features/chat/stores/chatsearchsettings.store';
import { cn } from '~/lib/utils';

// Props
// Emits

// Refs
const route = useRoute();
const router = useRouter();
// Restores search text/page/page-size from the URL (e.g. after navigating back from a chat),
// falling back to defaults for a fresh visit or a malformed/tampered query string.
const initialQuery = parseChatSearchQuery(route.query);

const searchInput = ref(initialQuery.q);
const query = ref(initialQuery.q);
const page = ref(initialQuery.page);
// 10, not the API's documented default of 20
// - `limit` is always sent explicitly below, so that default only
// matters when the param is omitted, and `ListPagination`' page-size
// `Select` only offers 10/25/50/100. A value outside that list (e.g. 20)
// leaves the select bound to a value with no matching `SelectItem`, which
// Radix/shadcn renders blank instead of falling back to the first option.
const limit = ref(initialQuery.limit);
// Snippets-per-chat-row is a fixed v1 default,
// independent of the page/limit pagination above.
const snippetsPerChat = ref(3);

// Composables
const { t } = useI18n();
const { caseSensitive } = storeToRefs(useChatSearchSettingsStore());
const { data, isLoading, isFetching, error } = useChatSearchApi({
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
  query.value = value.trim();
  page.value = 1; // reset to first page on a new search
}, 250);

function toggleCaseSensitive() {
  caseSensitive.value = !caseSensitive.value;
}

function clearSearch() {
  searchInput.value = '';
  query.value = '';
  page.value = 1;
}

// Hooks
watch(searchInput, applySearch);
watch(caseSensitive, () => {
  page.value = 1; // reset to first page, same as a new search
});

// Mirrors search text/page/page-size into the URL so they survive a
// back-navigation (e.g. from a chat opened out of the results). `replace`,
// not `push`, so neither keystrokes nor paging pile up browser history
// entries - the address bar just tracks the current state.
watch([query, page, limit], ([q, p, l]) => {
  router.replace({
    query: { ...route.query, q: q || undefined, page: p, limit: l },
  });
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
        <template v-if="data && data.results.length > 0">
          <ChatSearchResultsTable
            :results="data.results"
            :query="query"
            :class="{ 'opacity-60': isFetching }"
          />
          <div class="pb-10">
            <ListPagination
              v-model:page="page"
              v-model:limit="limit"
              :total-count="meta.totalCount"
              noun="chat.history.count"
            />
          </div>
        </template>
        <p
          v-else-if="isLoading"
          class="mx-auto max-w-md text-center text-body text-muted-foreground"
        >
          {{ t('chat.search.loading') }}
        </p>
        <p v-else-if="error" class="text-body text-muted-foreground">
          {{ error.message || t('chat.search.error') }}
        </p>
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
