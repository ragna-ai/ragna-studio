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
  DatasetRowData,
  DatasetRowManyResponse,
  DatasetRowResponse,
  DatasetResponse,
  UpdateDatasetRequest,
} from '~/features/dataset/types';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

export const datasetKeys = {
  all: (workspaceId: WorkspaceId) => ['datasets', workspaceId] as const,
  list: (
    workspaceId: WorkspaceId,
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
  ) => ['datasets', workspaceId, 'list', page, limit] as const,
  picker: (workspaceId: WorkspaceId) => ['datasets', workspaceId, 'picker'] as const,
  detail: (workspaceId: WorkspaceId, datasetId: MaybeRefOrGetter<string>) =>
    ['datasets', workspaceId, 'detail', datasetId] as const,
  rows: (workspaceId: WorkspaceId, datasetId: MaybeRefOrGetter<string>) =>
    ['datasets', workspaceId, 'detail', datasetId, 'rows'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

/** Body ofetch attaches to a thrown error for a non-2xx JSON response. */
type FetchErrorWithData = { data?: { error?: string } };

function getErrorMessage(error: unknown, fallback: string): string {
  return (error as FetchErrorWithData | undefined)?.data?.error || fallback;
}

export function useGetDataset(
  datasetId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DatasetResponse>({
    queryKey: datasetKeys.detail(workspaceId, datasetId),
    queryFn: ({ signal }) =>
      api(`/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && !!toValue(datasetId),
    ...options,
  });
}

/**
 * Unpaginated dataset list for the agent "Default dataset" picker
 * (docs/api-standards/prd.md: a resource lives in exactly one workspace, so
 * the picker only ever shows the agent's own workspace).
 */
export function useGetAllDatasetsForPicker() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DatasetManyResponse>({
    queryKey: datasetKeys.picker(workspaceId),
    queryFn: ({ signal }) =>
      api(`/workspace/${toValue(workspaceId)}/dataset`, {
        method: 'GET',
        query: { page: 1, limit: 100 },
        signal,
      }),
    enabled: () => !!toValue(workspaceId),
  });
}

export function useCreateDataset() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DatasetResponse, unknown, CreateDatasetRequest>({
    mutationFn: (body) =>
      api(`/workspace/${toValue(workspaceId)}/dataset`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all(workspaceId) });
      toast.success('Dataset created');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to create dataset'));
    },
  });
}

export function useUpdateDataset() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DatasetResponse, unknown, UpdateDatasetRequest>({
    mutationFn: ({ datasetId, ...body }) =>
      api(`/workspace/${toValue(workspaceId)}/dataset/${datasetId}`, { method: 'PATCH', body }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all(workspaceId) });
      queryClient.setQueryData(
        datasetKeys.detail(workspaceId, response.dataset.id),
        response,
      );
      toast.success('Dataset saved');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to save dataset'));
    },
  });
}

export function useDeleteDataset() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (datasetId) =>
      api(`/workspace/${toValue(workspaceId)}/dataset/${datasetId}`, { method: 'DELETE' }),
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
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<DatasetRowManyResponse>({
    queryKey: datasetKeys.rows(workspaceId, datasetId),
    queryFn: ({ signal }) =>
      api(`/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/row`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && !!toValue(datasetId),
    ...options,
  });
}

export function useCreateDatasetRow(datasetId: MaybeRefOrGetter<string>) {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DatasetRowResponse, unknown, DatasetRowData>({
    mutationFn: (data) =>
      api(`/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/row`, {
        method: 'POST',
        body: { data },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.rows(workspaceId, datasetId) });
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
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<DatasetRowResponse, unknown, UpdateDatasetRowVariables>({
    mutationFn: ({ rowId, data }) =>
      api(`/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/row/${rowId}`, {
        method: 'PATCH',
        body: { data },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.rows(workspaceId, datasetId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to update row'));
    },
  });
}

export function useDeleteDatasetRow(datasetId: MaybeRefOrGetter<string>) {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (rowId) =>
      api(`/workspace/${toValue(workspaceId)}/dataset/${toValue(datasetId)}/row/${rowId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.rows(workspaceId, datasetId) });
    },
    onError: () => {
      toast.error('Failed to delete row');
    },
  });
}
