import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  CreateDatasetRequest,
  DatasetExportFormat,
  DatasetManyResponse,
  DatasetResponse,
  DatasetRowData,
  DatasetRowManyResponse,
  DatasetRowResponse,
  MoveDatasetRowRequest,
  UpdateDatasetRequest,
} from '~/features/dataset/types';
import { extractErrorMessage } from '~/lib/api-error';
import {
  buildExportFilename,
  downloadBlob,
  filenameFromContentDisposition,
} from '~/lib/file-export';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

export const datasetKeys = {
  all: (workspaceId: WorkspaceId) => ['datasets', workspaceId] as const,
  list: (
    workspaceId: WorkspaceId,
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
  ) => ['datasets', workspaceId, 'list', page, limit] as const,
  picker: (workspaceId: WorkspaceId) =>
    ['datasets', workspaceId, 'picker'] as const,
  detail: (workspaceId: WorkspaceId, datasetId: MaybeRefOrGetter<string>) =>
    ['datasets', workspaceId, 'detail', datasetId] as const,
  rows: (workspaceId: WorkspaceId, datasetId: MaybeRefOrGetter<string>) =>
    ['datasets', workspaceId, 'detail', datasetId, 'rows'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export function useGetDataset(
  datasetId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DatasetResponse>({
    queryKey: datasetKeys.detail(workspaceId, datasetId),
    queryFn: ({ signal }) =>
      $api<DatasetResponse>(
        `/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(datasetId),
    shallow: true,
    ...options,
  });
}

/**
 * Unpaginated dataset list for the agent "Default dataset" picker
 * (docs/api-standards/prd.md: a resource lives in exactly one workspace, so
 * the picker only ever shows the agent's own workspace).
 */
export function useGetAllDatasetsForPicker() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DatasetManyResponse>({
    queryKey: datasetKeys.picker(workspaceId),
    queryFn: ({ signal }) =>
      $api<DatasetManyResponse>(`/workspace/${toValue(workspaceId)}/dataset`, {
        method: 'GET',
        query: { page: 1, limit: 100 },
        signal,
      }),
    enabled: () => !!toValue(workspaceId),
  });
}

export function useCreateDataset() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DatasetResponse, unknown, CreateDatasetRequest>({
    mutationFn: (body) =>
      $api<DatasetResponse>(`/workspace/${toValue(workspaceId)}/dataset`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all(workspaceId) });
      toast.success('Dataset created');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to create dataset'));
    },
  });
}

export function useUpdateDataset() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DatasetResponse, unknown, UpdateDatasetRequest>({
    mutationFn: ({ datasetId, ...body }) =>
      $api<DatasetResponse>(
        `/workspace/${toValue(workspaceId)}/dataset/${datasetId}`,
        { method: 'PATCH', body },
      ),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all(workspaceId) });
      queryClient.setQueryData(
        datasetKeys.detail(workspaceId, response.dataset.id),
        response,
      );
      toast.success('Dataset saved');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to save dataset'));
    },
  });
}

export function useDeleteDataset() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (datasetId) =>
      $api<void>(`/workspace/${toValue(workspaceId)}/dataset/${datasetId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all(workspaceId) });
      toast.success('Dataset deleted');
    },
    onError: () => {
      toast.error('Failed to delete dataset');
    },
  });
}

export function useGetDatasetRows(
  datasetId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DatasetRowManyResponse>({
    queryKey: datasetKeys.rows(workspaceId, datasetId),
    queryFn: ({ signal }) =>
      $api<DatasetRowManyResponse>(
        `/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/row`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(datasetId),
    shallow: true,
    ...options,
  });
}

export function useCreateDatasetRow(datasetId: MaybeRefOrGetter<string>) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DatasetRowResponse, unknown, DatasetRowData>({
    mutationFn: (data) =>
      $api<DatasetRowResponse>(
        `/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/row`,
        {
          method: 'POST',
          body: { data },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: datasetKeys.rows(workspaceId, datasetId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to add row'));
    },
  });
}

interface UpdateDatasetRowVariables {
  rowId: string;
  data: DatasetRowData;
}

export function useUpdateDatasetRow(datasetId: MaybeRefOrGetter<string>) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DatasetRowResponse, unknown, UpdateDatasetRowVariables>({
    mutationFn: ({ rowId, data }) =>
      $api<DatasetRowResponse>(
        `/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/row/${rowId}`,
        {
          method: 'PATCH',
          body: { data },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: datasetKeys.rows(workspaceId, datasetId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to update row'));
    },
  });
}

export function useDeleteDatasetRow(datasetId: MaybeRefOrGetter<string>) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (rowId) =>
      $api<void>(
        `/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/row/${rowId}`,
        {
          method: 'DELETE',
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: datasetKeys.rows(workspaceId, datasetId),
      });
    },
    onError: () => {
      toast.error('Failed to delete row');
    },
  });
}

// No optimistic reordering (PRD decision 7): a move just invalidates the
// rows query, same as every other row mutation above.
export function useMoveDatasetRow(datasetId: MaybeRefOrGetter<string>) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DatasetRowResponse, unknown, MoveDatasetRowRequest>({
    mutationFn: ({ rowId, afterRowId }) =>
      $api<DatasetRowResponse>(
        `/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/row/${rowId}/move`,
        {
          method: 'POST',
          body: { afterRowId },
        },
      ),
    // Returned so the mutation (and `isMovingRow`, which gates the up/down
    // buttons) stays pending until the refetch lands, not just until the
    // invalidation is queued. Otherwise a fast second click reads the
    // pre-move `rows` array and computes `afterRowId` from stale positions.
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: datasetKeys.rows(workspaceId, datasetId),
      }),
    onError: () => {
      toast.error('Failed to move row');
    },
  });
}

interface ExportDatasetVariables {
  format: DatasetExportFormat;
}

/**
 * Downloads the dataset as CSV/Excel/PDF/Markdown. Fetches through the same
 * authenticated API client as every other dataset call (not `window.open`:
 * the API is a different origin in dev), then saves the blob via a
 * temporary object URL.
 */
export function useExportDataset(
  datasetId: MaybeRefOrGetter<string>,
  datasetName: MaybeRefOrGetter<string>,
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useMutation<void, unknown, ExportDatasetVariables>({
    mutationFn: async ({ format }) => {
      const response = await $api.raw<Blob>(
        `/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/export`,
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
        ) ?? buildExportFilename(toValue(datasetName), format);
      downloadBlob(response._data, filename);
    },
    onError: () => {
      toast.error('Failed to export dataset');
    },
  });
}
