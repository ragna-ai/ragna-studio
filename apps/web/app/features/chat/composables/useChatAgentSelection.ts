import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useLocalStorage } from '@vueuse/core';
import { agentKeys } from '~/features/agent/composables/useAgentApi';
import type { Agent, AgentManyResponse } from '~/features/agent/types';

// The API rejects a larger page, and the combobox filters client-side.
const AGENT_OPTIONS_LIMIT = 100;

/**
 * Agent choice for a new chat. Resolves to the last agent the user picked in
 * this workspace, else the first agent, else null (no agents yet).
 */
export function useChatAgentSelection() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  const listQueryKey = agentKeys.list(workspaceId, 1, AGENT_OPTIONS_LIMIT, '');

  const { data, isLoading } = useQuery<AgentManyResponse>({
    queryKey: listQueryKey,
    queryFn: ({ signal }) =>
      $api<AgentManyResponse>(`/workspace/${workspaceId.value}/agent`, {
        method: 'GET',
        query: { page: 1, limit: AGENT_OPTIONS_LIMIT },
        signal,
      }),
    enabled: () => !!workspaceId.value,
  });

  const lastAgentId = useLocalStorage<string | null>(
    () => `chat:last-agent:${workspaceId.value}`,
    null,
  );

  const agents = computed(() => data.value?.agents ?? []);

  const selectedAgentId = computed(() => {
    const remembered = agents.value.find(
      (agent) => agent.id === lastAgentId.value,
    );
    return (remembered ?? agents.value[0])?.id ?? null;
  });

  // Only a loaded list can be empty, so loading never flashes the empty state.
  const hasNoAgents = computed(() => data.value?.meta.totalCount === 0);

  function selectAgent(agentId: string) {
    lastAgentId.value = agentId;
  }

  /** Adds a freshly created agent to the cached list and selects it, without a refetch. */
  function addAndSelectAgent(agent: Agent) {
    queryClient.setQueryData<AgentManyResponse>(listQueryKey, (current) => ({
      agents: [...(current?.agents ?? []), agent],
      meta: { totalCount: (current?.meta.totalCount ?? 0) + 1 },
    }));
    selectAgent(agent.id);
  }

  return {
    agents,
    isLoading,
    hasNoAgents,
    selectedAgentId,
    selectAgent,
    addAndSelectAgent,
  };
}
