import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  AgentMemoryResponse,
  AgentResponse,
  UpsertAgentRequest,
} from '~/features/agent/types';
import { useActiveWorkspace } from '~/features/workspace/composables/useActiveWorkspace';

export const agentKeys = {
  all: ['agents'] as const,
  list: (
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    search: MaybeRefOrGetter<string>,
    workspaceId: MaybeRefOrGetter<string | null>,
  ) => ['agents', 'list', page, limit, search, workspaceId] as const,
  detail: (agentId: MaybeRefOrGetter<string>) =>
    ['agents', 'detail', agentId] as const,
  memory: (agentId: MaybeRefOrGetter<string>) =>
    ['agents', 'memory', agentId] as const,
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

/** Unpaginated agent list for pickers (e.g. the workflow agent-node config). */
export function useGetAllAgents(options: QueryOpts = {}) {
  const api = useApi();
  return useQuery<AgentManyResponse>({
    queryKey: [...agentKeys.all, 'picker'],
    queryFn: ({ signal }) =>
      api('/agent', { method: 'GET', query: { page: 1, limit: 100 }, signal }),
    ...options,
  });
}

export function useUpsertAgent() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { activeWorkspaceId } = useActiveWorkspace();
  return useMutation<AgentResponse, unknown, UpsertAgentRequest>({
    mutationFn: (body) =>
      api('/agent', {
        method: 'POST',
        // Stamp the active workspace only when creating (no id yet).
        // Editing an existing agent must not silently move it: moving items
        // between workspaces is out of scope for v1 (docs/workspaces.md).
        body: body.id ? body : { ...body, workspaceId: activeWorkspaceId.value },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      toast.success('Agent updated');
    },
    onError: () => {
      toast.error('Failed to update agent');
    },
  });
}

export function useGetAgentMemory(
  agentId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  return useQuery<AgentMemoryResponse>({
    queryKey: agentKeys.memory(agentId),
    queryFn: ({ signal }) =>
      api(`/agent/${toValue(agentId)}/memory`, { method: 'GET', signal }),
    enabled: () => !!toValue(agentId),
    ...options,
  });
}

type UpdateAgentMemoryVariables = { agentId: string; content: string };

export function useUpdateAgentMemory() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<AgentMemoryResponse, unknown, UpdateAgentMemoryVariables>({
    mutationFn: ({ agentId, content }) =>
      api(`/agent/${agentId}/memory`, { method: 'PUT', body: { content } }),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.memory(agentId) });
      toast.success('Memory updated');
    },
    onError: () => {
      toast.error('Failed to update memory');
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
