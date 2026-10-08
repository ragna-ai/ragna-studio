import { useQuery } from '@tanstack/vue-query';
import { chatKeys } from '~/features/chat/composables/useChatApi';
import type { ChatAgent } from '~/features/chat/types';

/** Minimum characters before a search fires, matching the API's own floor
 * (specs/chat/search-prd.md, "Minimum query length": pg_trgm needs 3-char
 * trigrams to use its index). */
export const CHAT_SEARCH_MIN_QUERY_LENGTH = 3;

export interface ChatSearchSnippet {
  messageId: string;
  snippet: string;
}

export interface ChatSearchResult {
  id: string;
  title: string;
  titleMatched: boolean;
  updatedAt: string;
  agent: ChatAgent;
  messageSnippets: ChatSearchSnippet[];
}

export interface ChatSearchResponse {
  results: ChatSearchResult[];
  totalCount: number;
}

// Placeholder for a query below the enabled threshold (see `enabled` below):
// a stable empty result set rather than `undefined`, so the page can render
// its normal "no results" state instead of needing a separate loading/empty
// branch for "no search has run yet".
const EMPTY_CHAT_SEARCH_RESPONSE: ChatSearchResponse = {
  results: [],
  totalCount: 0,
};

interface ChatSearchParams {
  query: MaybeRefOrGetter<string>;
  page: MaybeRefOrGetter<number>;
  limit: MaybeRefOrGetter<number>;
  snippetsPerChat: MaybeRefOrGetter<number>;
  caseSensitive: MaybeRefOrGetter<boolean>;
}

/** [GET] /workspace/:workspaceId/chat/search (specs/chat/search-prd.md, "API"). */
export function useChatSearchApi({
  query,
  page,
  limit,
  snippetsPerChat,
  caseSensitive,
}: ChatSearchParams) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();

  return useQuery<ChatSearchResponse>({
    queryKey: chatKeys.search(
      workspaceId,
      query,
      page,
      limit,
      snippetsPerChat,
      caseSensitive,
    ),
    queryFn: ({ signal }) =>
      $api<ChatSearchResponse>(
        `/workspace/${toValue(workspaceId)}/chat/search`,
        {
          method: 'GET',
          query: {
            q: toValue(query),
            page: toValue(page),
            limit: toValue(limit),
            snippetsPerChat: toValue(snippetsPerChat),
            caseSensitive: toValue(caseSensitive),
          },
          signal,
        },
      ),
    enabled: () =>
      !!toValue(workspaceId) &&
      toValue(query).trim().length >= CHAT_SEARCH_MIN_QUERY_LENGTH,
    // Keep the previous response visible while a new one loads (typing
    // forward, paging, toggling case-sensitivity), but only while the query
    // is still above the enabled threshold above - otherwise `prev` is a
    // stale result set from a since-deleted-down query, which `enabled`
    // never refetches, so it would linger on screen indefinitely.
    placeholderData: (prev: ChatSearchResponse | undefined) =>
      toValue(query).trim().length >= CHAT_SEARCH_MIN_QUERY_LENGTH
        ? prev
        : EMPTY_CHAT_SEARCH_RESPONSE,
  });
}
