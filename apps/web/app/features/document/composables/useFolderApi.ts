import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import {
  documentKeys,
  folderKeys,
} from '~/features/document/composables/queryKeys';
import type {
  FolderManyResponse,
  FolderResponse,
} from '~/features/document/types';
import { toErrorMessage } from '~/lib/api-error';

type QueryOpts = Partial<UseQueryOptions<any>>;

export function useGetFolders(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<FolderManyResponse>({
    queryKey: folderKeys.list(workspaceId),
    queryFn: ({ signal }) =>
      $api<FolderManyResponse>(`/workspace/${toValue(workspaceId)}/folder`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId),
    ...options,
  });
}

export function useGetFolder(folderId: MaybeRefOrGetter<string | null>) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<FolderResponse>({
    queryKey: folderKeys.detail(workspaceId, folderId),
    queryFn: ({ signal }) =>
      $api<FolderResponse>(
        `/workspace/${toValue(workspaceId)}/folder/${toValue(folderId)}`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(folderId),
    retry: false,
  });
}

export function useCreateFolder() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<FolderResponse, unknown, { name: string }>({
    mutationFn: (body) =>
      $api<FolderResponse>(`/workspace/${toValue(workspaceId)}/folder`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all(workspaceId) });
      toast.success(t('folder.toast.created'));
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('folder.toast.createFailed')));
    },
  });
}

interface RenameFolderVariables {
  folderId: string;
  name: string;
}

export function useRenameFolder() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<FolderResponse, unknown, RenameFolderVariables>({
    mutationFn: ({ folderId, name }) =>
      $api<FolderResponse>(
        `/workspace/${toValue(workspaceId)}/folder/${folderId}`,
        {
          method: 'PATCH',
          body: { name },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all(workspaceId) });
      queryClient.invalidateQueries({
        queryKey: documentKeys.list(workspaceId),
      });
      toast.success(t('folder.toast.renamed'));
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('folder.toast.renameFailed')));
    },
  });
}

/** Deleting a folder moves its documents to root; it never deletes them. */
export function useDeleteFolder() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (folderId) =>
      $api<void>(`/workspace/${toValue(workspaceId)}/folder/${folderId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all(workspaceId) });
      queryClient.invalidateQueries({
        queryKey: documentKeys.list(workspaceId),
      });
      toast.success(t('folder.toast.deleted'));
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('folder.toast.deleteFailed')));
    },
  });
}
