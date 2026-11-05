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
import {
  documentKeys,
  folderKeys,
} from '~/features/document/composables/queryKeys';
import { extractErrorMessage } from '~/lib/api-error';
import {
  buildExportFilename,
  downloadBlob,
  filenameFromContentDisposition,
} from '~/lib/file-export';

type QueryOpts = Partial<UseQueryOptions<any>>;

export function useGetDocuments(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DocumentManyResponse>({
    queryKey: documentKeys.list(workspaceId),
    queryFn: ({ signal }) =>
      $api<DocumentManyResponse>(
        `/workspace/${toValue(workspaceId)}/document`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId),
    ...options,
  });
}

/** Lists the documents of one folder, or of the top level for `root`. */
export function useGetDocumentsInFolder(
  folderFilter: MaybeRefOrGetter<string>,
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DocumentManyResponse>({
    queryKey: documentKeys.listInFolder(workspaceId, folderFilter),
    queryFn: ({ signal }) =>
      $api<DocumentManyResponse>(
        `/workspace/${toValue(workspaceId)}/document`,
        {
          method: 'GET',
          query: { folderId: toValue(folderFilter) },
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId),
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
  const { t } = useI18n();
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
      queryClient.invalidateQueries({ queryKey: folderKeys.all(workspaceId) });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, t('document.toast.createFailed')));
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
  const { t } = useI18n();
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
      queryClient.invalidateQueries({ queryKey: folderKeys.all(workspaceId) });
      queryClient.setQueryData(
        documentKeys.detail(workspaceId, response.document.id),
        response,
      );
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, t('document.toast.saveFailed')));
    },
  });
}

export function useDeleteDocument() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
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
      queryClient.invalidateQueries({ queryKey: folderKeys.all(workspaceId) });
      toast.success(t('document.toast.deleted'));
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, t('document.toast.deleteFailed')));
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
  const { t } = useI18n();
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
        filenameFromContentDisposition(
          response.headers.get('content-disposition'),
        ) ?? buildExportFilename(toValue(documentTitle), format);
      downloadBlob(response._data, filename);
    },
    onError: () => {
      toast.error(t('document.toast.exportFailed'));
    },
  });
}
