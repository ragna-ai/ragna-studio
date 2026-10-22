import { useQuery } from '@tanstack/vue-query';
import { useLocalStorage } from '@vueuse/core';
import { agentKeys } from '~/features/agent/composables/useAgentApi';
import type { AgentManyResponse } from '~/features/agent/types';

// The API rejects a larger page, and the combobox filters client-side.
const AGENT_OPTIONS_LIMIT = 100;

/**
 * Agent choice for a new chat. Resolves to the last agent the user picked in
 * this workspace, else the workspace default agent, else null (the server then
 * creates and uses the default agent).
 */
export function useChatAgentSelection() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();

  const { data, isLoading } = useQuery<AgentManyResponse>({
    queryKey: agentKeys.list(workspaceId, 1, AGENT_OPTIONS_LIMIT, ''),
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
    const fallback = agents.value.find((agent) => agent.isDefault);
    return (remembered ?? fallback)?.id ?? null;
  });

  function selectAgent(agentId: string) {
    lastAgentId.value = agentId;
  }

  return { agents, isLoading, selectedAgentId, selectAgent };
}
