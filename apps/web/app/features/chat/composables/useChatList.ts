import { useQuery, type UseQueryOptions } from '@tanstack/vue-query';
import { useDebounceFn } from '@vueuse/core';
import {
  chatKeys,
  type ChatHistoryResponse,
} from '~/features/chat/composables/useChatApi';
import { useActiveWorkspace } from '~/features/workspace/composables/useActiveWorkspace';

type QueryOpts = Partial<UseQueryOptions<any>>;

export default function useChatList() {
  const api = useApi();
  const { activeWorkspaceId } = useActiveWorkspace();

  // useState -> single shared instance keyed by name, so pagination/search is
  // owned once instead of per-caller (the old clustered composable gave each
  // caller its own independent state).
  const page = useState('chat-list:page', () => 1);
  const limit = useState('chat-list:limit', () => 10);
  const searchQuery = useState('chat-list:search', () => '');

  const setSearchQuery = useDebounceFn((newSearchQuery: string) => {
    searchQuery.value = newSearchQuery;
    page.value = 1; // reset to first page on a new search
  }, 300);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function useGetAllChats(options: QueryOpts = {}) {
    return useQuery<ChatHistoryResponse>({
      queryKey: chatKeys.list(page, limit, searchQuery, activeWorkspaceId),
      queryFn: ({ signal }) =>
        api('/chat', {
          method: 'GET',
          query: {
            page: page.value,
            limit: limit.value,
            searchQuery: searchQuery.value,
            workspaceId: activeWorkspaceId.value ?? undefined,
          },
          signal,
        }),
      placeholderData: (prev: ChatHistoryResponse | undefined) => prev, // keep previous results while refetching
      ...options,
    });
  }

  return {
    page,
    limit,
    searchQuery,
    setPage,
    setSearchQuery,
    useGetAllChats,
  };
}
