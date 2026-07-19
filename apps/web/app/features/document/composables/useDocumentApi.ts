import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  CreateDocumentRequest,
  DocumentManyResponse,
  DocumentResponse,
  UpdateDocumentRequest,
} from '~/features/document/types';
import { extractErrorMessage } from '~/lib/api-error';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

export const documentKeys = {
  all: (workspaceId: WorkspaceId) => ['documents', workspaceId] as const,
  list: (workspaceId: WorkspaceId) =>
    ['documents', workspaceId, 'list'] as const,
  detail: (workspaceId: WorkspaceId, documentId: MaybeRefOrGetter<string>) =>
    ['documents', workspaceId, 'detail', documentId] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export function useGetDocuments(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DocumentManyResponse>({
    queryKey: documentKeys.list(workspaceId),
    queryFn: ({ signal }) =>
      $api<DocumentManyResponse>(
        `/workspace/${toValue(workspaceId)}/document`,
        { method: 'GET', signal },
      ),
    enabled: () => !!toValue(workspaceId),
    ...options,
  });
}

export function useGetDocument(
  documentId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DocumentResponse>({
    queryKey: documentKeys.detail(workspaceId, documentId),
    queryFn: ({ signal }) =>
      $api<DocumentResponse>(
        `/workspace/${toValue(workspaceId)}/document/${toValue(documentId)}`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(documentId),
    ...options,
  });
}

export function useCreateDocument() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DocumentResponse, unknown, CreateDocumentRequest>({
    mutationFn: (body) =>
      $api<DocumentResponse>(`/workspace/${toValue(workspaceId)}/document`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.all(workspaceId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to create document'));
    },
  });
}

interface UpdateDocumentVariables extends UpdateDocumentRequest {
  documentId: string;
}

/**
 * Doubles as the autosave mutation (docs/documents/prd.md): no success toast
 * here, since that would fire on every debounced keystroke save. Callers
 * that represent a deliberate action (move to folder, rename from the list)
 * pass their own `onSuccess` to `mutate()` to surface one.
 */
export function useUpdateDocument() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DocumentResponse, unknown, UpdateDocumentVariables>({
    mutationFn: ({ documentId, ...body }) =>
      $api<DocumentResponse>(
        `/workspace/${toValue(workspaceId)}/document/${documentId}`,
        {
          method: 'PATCH',
          body,
        },
      ),
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.list(workspaceId),
      });
      queryClient.setQueryData(
        documentKeys.detail(workspaceId, response.document.id),
        response,
      );
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to save document'));
    },
  });
}

export function useDeleteDocument() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (documentId) =>
      $api<void>(`/workspace/${toValue(workspaceId)}/document/${documentId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.all(workspaceId),
      });
      toast.success('Document deleted');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to delete document'));
    },
  });
}
