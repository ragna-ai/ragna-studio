import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  CreateDocumentRequest,
  DocumentExportFormat,
  DocumentManyResponse,
  DocumentResponse,
  UpdateDocumentRequest,
} from '~/features/document/types';
import { extractErrorMessage } from '~/lib/api-error';
import {
  buildExportFilename,
  downloadBlob,
  filenameFromContentDisposition,
} from '~/lib/file-export';

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
 * Doubles as the autosave mutation: no success toast
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

interface ExportDocumentVariables {
  format: DocumentExportFormat;
}

/**
 * Downloads the document as Markdown/Text/PDF/Word, same mechanics as
 * `useExportDataset`: fetch through the authenticated API client as a blob
 * (not `window.open`), name it from Content-Disposition when present, then
 * save it via a temporary object URL.
 */
export function useExportDocument(
  documentId: MaybeRefOrGetter<string>,
  documentTitle: MaybeRefOrGetter<string>,
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useMutation<void, unknown, ExportDocumentVariables>({
    mutationFn: async ({ format }) => {
      const response = await $api.raw<Blob>(
        `/workspace/${toValue(workspaceId)}/document/${toValue(documentId)}/export`,
        {
          method: 'GET',
          query: { format },
          responseType: 'blob',
        },
      );
      if (!response._data) {
        throw new Error('Empty export response');
      }
      const filename =
        filenameFromContentDisposition(response.headers.get('content-disposition')) ??
        buildExportFilename(toValue(documentTitle), format);
      downloadBlob(response._data, filename);
    },
    onError: () => {
      toast.error('Failed to export document');
    },
  });
}
