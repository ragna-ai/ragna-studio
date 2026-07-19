import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  WorkspaceManyResponse,
  WorkspaceResponse,
} from '~/features/workspace/types';
import { extractErrorMessage } from '~/lib/api-error';

export const workspaceKeys = {
  all: ['workspaces'] as const,
  list: () => ['workspaces', 'list'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export function useGetWorkspaces(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  return useQuery<WorkspaceManyResponse>({
    queryKey: workspaceKeys.list(),
    queryFn: ({ signal }) =>
      $api<WorkspaceManyResponse>('/workspace', { method: 'GET', signal }),
    ...options,
  });
}

export function useCreateWorkspace() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation<WorkspaceResponse, unknown, { name: string }>({
    mutationFn: (body) =>
      $api<WorkspaceResponse>('/workspace', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      toast.success(t('workspace.toast.createSuccess'));
    },
    onError: () => {
      toast.error(t('workspace.toast.createError'));
    },
  });
}

interface RenameWorkspaceVariables {
  workspaceId: string;
  name: string;
}

export function useRenameWorkspace() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation<WorkspaceResponse, unknown, RenameWorkspaceVariables>({
    mutationFn: ({ workspaceId, name }) =>
      $api<WorkspaceResponse>(`/workspace/${workspaceId}`, {
        method: 'PATCH',
        body: { name },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      toast.success(t('workspace.toast.renameSuccess'));
    },
    onError: () => {
      toast.error(t('workspace.toast.renameError'));
    },
  });
}

export function useDeleteWorkspace() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation<void, unknown, string>({
    mutationFn: (workspaceId) =>
      $api<void>(`/workspace/${workspaceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      toast.success(t('workspace.toast.deleteSuccess'));
    },
    onError: (error) => {
      // The API rejects deleting a user's only workspace with a 400 and a
      // human-readable message; surface that instead of a generic failure.
      toast.error(extractErrorMessage(error, t('workspace.toast.deleteError')));
    },
  });
}
