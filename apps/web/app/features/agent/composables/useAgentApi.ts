import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type { AgentResponse, UpsertAgentRequest } from '~/features/agent/types';

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

export function useGetAgent(
  agentId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  return useQuery<AgentResponse>({
    queryKey: agentKeys.detail(agentId),
    queryFn: ({ signal }) =>
      api(`/agent/${toValue(agentId)}`, { method: 'GET', signal }),
    enabled: () => !!toValue(agentId),
    ...options,
  });
}

export function useUpsertAgent() {
  const api = useApi();
  const queryClient = useQueryClient();
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

export function useDeleteAgent() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (agentId) => api(`/agent/${agentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      toast.success('Agent deleted');
    },
    onError: () => {
      toast.error('Failed to delete agent');
    },
  });
}
