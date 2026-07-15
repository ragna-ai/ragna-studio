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

export const workspaceKeys = {
  all: ['workspaces'] as const,
  list: () => ['workspaces', 'list'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export function useGetWorkspaces(options: QueryOpts = {}) {
  const api = useApi();
  return useQuery<WorkspaceManyResponse>({
    queryKey: workspaceKeys.list(),
    queryFn: ({ signal }) => api('/workspace', { method: 'GET', signal }),
    ...options,
  });
}

export function useCreateWorkspace() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation<WorkspaceResponse, unknown, { name: string }>({
    mutationFn: (body) => api('/workspace', { method: 'POST', body }),
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
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation<WorkspaceResponse, unknown, RenameWorkspaceVariables>({
    mutationFn: ({ workspaceId, name }) =>
      api(`/workspace/${workspaceId}`, { method: 'PATCH', body: { name } }),
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
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation<void, unknown, string>({
    mutationFn: (workspaceId) =>
      api(`/workspace/${workspaceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      toast.success(t('workspace.toast.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('workspace.toast.deleteError'));
    },
  });
}
