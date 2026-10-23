import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { agentKeys } from '~/features/agent/composables/useAgentApi';
import type {
  AgentResponse,
  AgentTemplateManyResponse,
} from '~/features/agent/types';
import { extractErrorMessage } from '~/lib/api-error';

export const agentTemplateKeys = {
  all: ['agent-templates'] as const,
};

export function useGetAgentTemplates() {
  const { $api } = useNuxtApp();
  return useQuery<AgentTemplateManyResponse>({
    queryKey: agentTemplateKeys.all,
    queryFn: ({ signal }) =>
      $api<AgentTemplateManyResponse>('/agent-template', {
        method: 'GET',
        signal,
      }),
  });
}

/** Creates an agent in the active workspace from a template. Callers may also write the result into their own cache. */
export function useCreateAgentFromTemplate() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<AgentResponse, unknown, string>({
    mutationFn: (templateId) =>
      $api<AgentResponse>(
        `/workspace/${toValue(workspaceId)}/agent/from-template`,
        {
          method: 'POST',
          body: { templateId },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all(workspaceId) });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to create agent'));
    },
  });
}
