import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { useDebounceFn } from '@vueuse/core';
import { toast } from 'vue-sonner';

interface Agent {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface NewAgent {
  name: string;
  description: string;
}

export const agentKeys = {
  all: ['agents'] as const,
  list: (page: MaybeRefOrGetter<number>, search: MaybeRefOrGetter<string>) =>
    ['agents', 'list', page, search] as const,
  detail: (agentId: MaybeRefOrGetter<string>) =>
    ['agents', 'detail', agentId] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export default function useAgentApi() {
  const api = useApi();
  const queryClient = useQueryClient();

  const page = ref<number>(1);
  const searchQuery = ref<string>('');

  const setSearchQuery = useDebounceFn((newSearchQuery: string) => {
    searchQuery.value = newSearchQuery;
  }, 300);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function getAllAgents(options: QueryOpts = {}) {
    return useQuery({
      queryKey: agentKeys.list(page, searchQuery),
      queryFn: ({ signal }) =>
        api<Agent[]>('/agent', {
          method: 'GET',
          query: { page: page.value, searchQuery: searchQuery.value },
          signal,
        }),
      placeholderData: (prev: unknown) => prev, // keep previous results while refetching
      ...options,
    });
  }

  function getAgent(
    agentId: MaybeRefOrGetter<string>,
    options: QueryOpts = {},
  ) {
    return useQuery({
      queryKey: agentKeys.detail(agentId),
      queryFn: ({ signal }) =>
        api<Agent>(`/agent/${toValue(agentId)}`, { method: 'GET', signal }),
      enabled: () => !!toValue(agentId),
      ...options,
    });
  }

  function createAgent() {
    return useMutation({
      mutationFn: (body: NewAgent) => api('/agent', { method: 'POST', body }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: agentKeys.all });
        toast.success('Agent created');
      },
      onError: () => {
        toast.error('Failed to create agent');
      },
    });
  }

  function deleteAgent() {
    return useMutation({
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
    createAgent,
    deleteAgent,
  };
}
