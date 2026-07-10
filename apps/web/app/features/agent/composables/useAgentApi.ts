import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { useDebounceFn } from '@vueuse/core';
import { toast } from 'vue-sonner';
import type {
  AgentManyResponse,
  AgentResponse,
  UpsertAgentRequest,
} from '~/features/agent/types';

export const agentKeys = {
  all: ['agents'] as const,
  list: (
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    search: MaybeRefOrGetter<string>,
  ) => ['agents', 'list', page, limit, search] as const,
  detail: (agentId: MaybeRefOrGetter<string>) =>
    ['agents', 'detail', agentId] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export default function useAgentApi() {
  const api = useApi();
  const queryClient = useQueryClient();

  const page = ref<number>(1);
  const limit = ref<number>(10);
  const searchQuery = ref<string>('');

  const setSearchQuery = useDebounceFn((newSearchQuery: string) => {
    searchQuery.value = newSearchQuery;
  }, 300);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function getAllAgents(options: QueryOpts = {}) {
    return useQuery<AgentManyResponse>({
      queryKey: agentKeys.list(page, limit, searchQuery),
      queryFn: ({ signal }) =>
        api('/agent', {
          method: 'GET',
          query: {
            page: page.value,
            limit: limit.value,
            searchQuery: searchQuery.value,
          },
          signal,
        }),
      placeholderData: (prev: AgentManyResponse | undefined) => prev, // keep previous results while refetching
      ...options,
    });
  }

  function getAgent(
    agentId: MaybeRefOrGetter<string>,
    options: QueryOpts = {},
  ) {
    return useQuery<AgentResponse>({
      queryKey: agentKeys.detail(agentId),
      queryFn: ({ signal }) =>
        api(`/agent/${toValue(agentId)}`, { method: 'GET', signal }),
      enabled: () => !!toValue(agentId),
      ...options,
    });
  }

  function upsertAgent() {
    return useMutation<AgentResponse, unknown, UpsertAgentRequest>({
      mutationFn: (body) => api('/agent', { method: 'POST', body }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: agentKeys.all });
        toast.success('Agent updated');
      },
      onError: () => {
        toast.error('Failed to update agent');
      },
    });
  }

  function deleteAgent() {
    return useMutation<void, unknown, string>({
      mutationFn: (agentId: string) =>
        api(`/agent/${agentId}`, { method: 'DELETE' }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: agentKeys.all });
        toast.success('Agent deleted');
      },
      onError: () => {
        toast.error('Failed to delete agent');
      },
    });
  }

  return {
    page,
    searchQuery,
    setPage,
    setSearchQuery,
    getAllAgents,
    getAgent,
    upsertAgent,
    deleteAgent,
  };
}
