import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { documentKeys } from '~/features/document/composables/useDocumentApi';
import type { FolderManyResponse, FolderResponse } from '~/features/document/types';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

export const folderKeys = {
  all: (workspaceId: WorkspaceId) => ['folders', workspaceId] as const,
  list: (workspaceId: WorkspaceId) => ['folders', workspaceId, 'list'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

/** Body ofetch attaches to a thrown error for a non-2xx JSON response. */
type FetchErrorWithData = { data?: { error?: string } };

function getErrorMessage(error: unknown, fallback: string): string {
  return (error as FetchErrorWithData | undefined)?.data?.error || fallback;
}

export function useGetFolders(options: QueryOpts = {}) {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<FolderManyResponse>({
    queryKey: folderKeys.list(workspaceId),
    queryFn: ({ signal }) =>
      api(`/workspace/${toValue(workspaceId)}/folder`, { method: 'GET', signal }),
    enabled: () => !!toValue(workspaceId),
    ...options,
  });
}

export function useCreateFolder() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<FolderResponse, unknown, { name: string }>({
    mutationFn: (body) =>
      api(`/workspace/${toValue(workspaceId)}/folder`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all(workspaceId) });
      toast.success('Folder created');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to create folder'));
    },
  });
}

interface RenameFolderVariables {
  folderId: string;
  name: string;
}

export function useRenameFolder() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<FolderResponse, unknown, RenameFolderVariables>({
    mutationFn: ({ folderId, name }) =>
      api(`/workspace/${toValue(workspaceId)}/folder/${folderId}`, {
        method: 'PATCH',
        body: { name },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all(workspaceId) });
      queryClient.invalidateQueries({ queryKey: documentKeys.list(workspaceId) });
      toast.success('Folder renamed');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to rename folder'));
    },
  });
}

/** Deleting a folder moves its documents to root; it never deletes them. */
export function useDeleteFolder() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (folderId) =>
      api(`/workspace/${toValue(workspaceId)}/folder/${folderId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all(workspaceId) });
      queryClient.invalidateQueries({ queryKey: documentKeys.list(workspaceId) });
      toast.success('Folder deleted');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to delete folder'));
    },
  });
}
