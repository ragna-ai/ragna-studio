import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { documentKeys } from '~/features/document/composables/useDocumentApi';
import type {
  FolderManyResponse,
  FolderResponse,
} from '~/features/document/types';
import { extractErrorMessage } from '~/lib/api-error';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

export const folderKeys = {
  all: (workspaceId: WorkspaceId) => ['folders', workspaceId] as const,
  list: (workspaceId: WorkspaceId) => ['folders', workspaceId, 'list'] as const,
};

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

export function useCreateFolder() {
  const { $api, $i18n } = useNuxtApp();
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
      toast.success($i18n.t('folder.toast.created'));
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, $i18n.t('folder.toast.createFailed')),
      );
    },
  });
}

interface RenameFolderVariables {
  folderId: string;
  name: string;
}

export function useRenameFolder() {
  const { $api, $i18n } = useNuxtApp();
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
      toast.success($i18n.t('folder.toast.renamed'));
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, $i18n.t('folder.toast.renameFailed')),
      );
    },
  });
}

/** Deleting a folder moves its documents to root; it never deletes them. */
export function useDeleteFolder() {
  const { $api, $i18n } = useNuxtApp();
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
      toast.success($i18n.t('folder.toast.deleted'));
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, $i18n.t('folder.toast.deleteFailed')),
      );
    },
  });
}
