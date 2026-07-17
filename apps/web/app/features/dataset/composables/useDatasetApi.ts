import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  CreateDatasetRequest,
  DatasetManyResponse,
  DatasetResponse,
  DatasetRowData,
  DatasetRowManyResponse,
  DatasetRowResponse,
  UpdateDatasetRequest,
} from '~/features/dataset/types';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

export const datasetKeys = {
  all: ['datasets'] as const,
  list: (
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    scopeKey: MaybeRefOrGetter<string>,
  ) => ['datasets', 'list', page, limit, scopeKey] as const,
  picker: (workspaceId: MaybeRefOrGetter<string | null | undefined>) =>
    ['datasets', 'picker', workspaceId] as const,
  detail: (datasetId: MaybeRefOrGetter<string>) => ['datasets', 'detail', datasetId] as const,
  rows: (datasetId: MaybeRefOrGetter<string>) => ['datasets', 'detail', datasetId, 'rows'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

/** Body ofetch attaches to a thrown error for a non-2xx JSON response. */
type FetchErrorWithData = { data?: { error?: string } };

function getErrorMessage(error: unknown, fallback: string): string {
  return (error as FetchErrorWithData | undefined)?.data?.error || fallback;
}

export function useGetDataset(datasetId: MaybeRefOrGetter<string>, options: QueryOpts = {}) {
  const api = useApi();
  return useQuery<DatasetResponse>({
    queryKey: datasetKeys.detail(datasetId),
    queryFn: ({ signal }) => api(`/dataset/${toValue(datasetId)}`, { method: 'GET', signal }),
    enabled: () => !!toValue(datasetId),
    ...options,
  });
}

/**
 * Unpaginated dataset list for the agent "Default dataset" picker, scoped
 * the same way the tools' workspace hard filter is (docs/datasets.md
 * decision 11): a specific workspace filters to it, `null`/`undefined`
 * (the agent itself is unassigned) shows every dataset.
 */
export function useGetAllDatasetsForPicker(
  workspaceId: MaybeRefOrGetter<string | null | undefined>,
) {
  const api = useApi();
  return useQuery<DatasetManyResponse>({
    queryKey: datasetKeys.picker(workspaceId),
    queryFn: ({ signal }) => {
      const scopedWorkspaceId = toValue(workspaceId);
      return api('/dataset', {
        method: 'GET',
        query: {
          page: 1,
          limit: 100,
          ...(scopedWorkspaceId ? { workspaceId: scopedWorkspaceId } : {}),
        },
        signal,
      });
    },
  });
}

export function useCreateDataset() {
  const api = useApi();
  const queryClient = useQueryClient();
  const workspaceScopeStore = useWorkspaceScopeStore();
  return useMutation<DatasetResponse, unknown, CreateDatasetRequest>({
    mutationFn: (body) => {
      // New datasets inherit the active workspace only when a specific
      // workspace is selected (docs/workspaces.md); All and Unassigned both
      // mean "no workspace".
      const workspaceId = workspaceScopeStore.createWorkspaceId;
      return api('/dataset', {
        method: 'POST',
        body: workspaceId ? { ...body, workspaceId } : body,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
      toast.success('Dataset created');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to create dataset'));
    },
  });
}

export function useUpdateDataset() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<DatasetResponse, unknown, UpdateDatasetRequest>({
    mutationFn: ({ datasetId, ...body }) =>
      api(`/dataset/${datasetId}`, { method: 'PATCH', body }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
      queryClient.invalidateQueries({ queryKey: datasetKeys.detail(response.dataset.id) });
      toast.success('Dataset saved');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to save dataset'));
    },
  });
}

export function useDeleteDataset() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (datasetId) => api(`/dataset/${datasetId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
      toast.success('Dataset deleted');
    },
    onError: () => {
      toast.error('Failed to delete dataset');
    },
  });
}

export function useGetDatasetRows(datasetId: MaybeRefOrGetter<string>, options: QueryOpts = {}) {
  const api = useApi();
  return useQuery<DatasetRowManyResponse>({
    queryKey: datasetKeys.rows(datasetId),
    queryFn: ({ signal }) => api(`/dataset/${toValue(datasetId)}/rows`, { method: 'GET', signal }),
    enabled: () => !!toValue(datasetId),
    ...options,
  });
}

export function useCreateDatasetRow(datasetId: MaybeRefOrGetter<string>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<DatasetRowResponse, unknown, DatasetRowData>({
    mutationFn: (data) =>
      api(`/dataset/${toValue(datasetId)}/rows`, { method: 'POST', body: { data } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.rows(datasetId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to add row'));
    },
  });
}

interface UpdateDatasetRowVariables {
  rowId: string;
  data: DatasetRowData;
}

export function useUpdateDatasetRow(datasetId: MaybeRefOrGetter<string>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<DatasetRowResponse, unknown, UpdateDatasetRowVariables>({
    mutationFn: ({ rowId, data }) =>
      api(`/dataset/${toValue(datasetId)}/rows/${rowId}`, { method: 'PATCH', body: { data } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.rows(datasetId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to update row'));
    },
  });
}

export function useDeleteDatasetRow(datasetId: MaybeRefOrGetter<string>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (rowId) =>
      api(`/dataset/${toValue(datasetId)}/rows/${rowId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.rows(datasetId) });
    },
    onError: () => {
      toast.error('Failed to delete row');
    },
  });
}
