import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from '~/lib/toast';
import { agentKeys } from '~/features/agent/composables/useAgentApi';
import type {
  AgentResponse,
  AgentTemplateManyResponse,
} from '~/features/agent/types';
import { toErrorMessage } from '~/lib/api-error';

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
  const { t } = useI18n();
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
      toast.error(toErrorMessage(error, t('agent.toast.createFailed')));
    },
  });
}
