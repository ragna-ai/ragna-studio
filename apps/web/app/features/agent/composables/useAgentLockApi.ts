import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  agentBasePath,
  agentKeys,
} from '~/features/agent/composables/useAgentApi';
import type {
  AgentUsage,
  AgentVersionManyResponse,
} from '~/features/agent/types';
import { toErrorMessage } from '~/lib/api-error';
import { toast } from '~/lib/toast';

type LockPath = 'lock' | 'unattended-approval';

interface LockMutationOptions {
  path: LockPath;
  method: 'POST' | 'DELETE';
  query?: Record<string, string>;
  successMessage: string;
  failureMessage: string;
}

/** Shared by the four lock mutations: they differ only in path, method and messages. */
function useAgentLockMutation(options: LockMutationOptions) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (agentId) => {
      const { path, method, query } = options;
      return $api<void>(`${agentBasePath(workspaceId)}/${agentId}/${path}`, {
        method,
        query,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all(workspaceId) });
      toast.success(options.successMessage);
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, options.failureMessage));
    },
  });
}

export function useLockAgent() {
  const { t } = useI18n();
  return useAgentLockMutation({
    path: 'lock',
    method: 'POST',
    successMessage: t('agent.lock.toast.locked'),
    failureMessage: t('agent.lock.toast.lockFailed'),
  });
}

export function useUnlockAgent() {
  const { t } = useI18n();
  return useAgentLockMutation({
    path: 'lock',
    method: 'DELETE',
    successMessage: t('agent.lock.toast.unlocked'),
    failureMessage: t('agent.lock.toast.unlockFailed'),
  });
}

/** Cancels the agent's active task runs, then unlocks it. */
export function useUnlockAgentStoppingRuns() {
  const { t } = useI18n();
  return useAgentLockMutation({
    path: 'lock',
    method: 'DELETE',
    query: { stopRuns: 'true' },
    successMessage: t('agent.lock.toast.unlocked'),
    failureMessage: t('agent.lock.toast.unlockFailed'),
  });
}

export function useApproveAgent() {
  const { t } = useI18n();
  return useAgentLockMutation({
    path: 'unattended-approval',
    method: 'POST',
    successMessage: t('agent.lock.toast.approved'),
    failureMessage: t('agent.lock.toast.approveFailed'),
  });
}

export function useRevokeAgentApproval() {
  const { t } = useI18n();
  return useAgentLockMutation({
    path: 'unattended-approval',
    method: 'DELETE',
    successMessage: t('agent.lock.toast.revoked'),
    failureMessage: t('agent.lock.toast.revokeFailed'),
  });
}

export function useGetAgentVersions(
  agentId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<AgentVersionManyResponse>({
    queryKey: agentKeys.versions(workspaceId, agentId),
    queryFn: ({ signal }) =>
      $api<AgentVersionManyResponse>(
        `${agentBasePath(workspaceId)}/${toValue(agentId)}/versions`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && toValue(enabled),
  });
}

/** Live counts for the unlock dialog: read each time it opens, never cached. */
export function useGetAgentUsage(
  agentId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<AgentUsage>({
    queryKey: agentKeys.usage(workspaceId, agentId),
    queryFn: ({ signal }) =>
      $api<AgentUsage>(
        `${agentBasePath(workspaceId)}/${toValue(agentId)}/usage`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && toValue(enabled),
    gcTime: 0,
  });
}
