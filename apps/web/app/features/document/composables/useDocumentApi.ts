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

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

export const documentKeys = {
  all: (workspaceId: WorkspaceId) => ['documents', workspaceId] as const,
  list: (workspaceId: WorkspaceId) => ['documents', workspaceId, 'list'] as const,
  detail: (workspaceId: WorkspaceId, documentId: MaybeRefOrGetter<string>) =>
    ['documents', workspaceId, 'detail', documentId] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

/** Body ofetch attaches to a thrown error for a non-2xx JSON response. */
type FetchErrorWithData = { data?: { error?: string } };

function getErrorMessage(error: unknown, fallback: string): string {
  return (error as FetchErrorWithData | undefined)?.data?.error || fallback;
}

export function useGetDocuments(workspaceId: WorkspaceId, options: QueryOpts = {}) {
  const api = useApi();
  return useQuery<DocumentManyResponse>({
    queryKey: documentKeys.list(workspaceId),
    queryFn: ({ signal }) =>
      api(`/workspace/${toValue(workspaceId)}/document`, { method: 'GET', signal }),
    enabled: () => !!toValue(workspaceId),
    ...options,
  });
}

export function useGetDocument(
  workspaceId: WorkspaceId,
  documentId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  return useQuery<DocumentResponse>({
    queryKey: documentKeys.detail(workspaceId, documentId),
    queryFn: ({ signal }) =>
      api(`/workspace/${toValue(workspaceId)}/document/${toValue(documentId)}`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && !!toValue(documentId),
    ...options,
  });
}

export function useCreateDocument(workspaceId: WorkspaceId) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<DocumentResponse, unknown, CreateDocumentRequest>({
    mutationFn: (body) =>
      api(`/workspace/${toValue(workspaceId)}/document`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all(workspaceId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to create document'));
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
export function useUpdateDocument(workspaceId: WorkspaceId) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<DocumentResponse, unknown, UpdateDocumentVariables>({
    mutationFn: ({ documentId, ...body }) =>
      api(`/workspace/${toValue(workspaceId)}/document/${documentId}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: documentKeys.list(workspaceId) });
      queryClient.setQueryData(
        documentKeys.detail(workspaceId, response.document.id),
        response,
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to save document'));
    },
  });
}

export function useDeleteDocument(workspaceId: WorkspaceId) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (documentId) =>
      api(`/workspace/${toValue(workspaceId)}/document/${documentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all(workspaceId) });
      toast.success('Document deleted');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to delete document'));
    },
  });
}
