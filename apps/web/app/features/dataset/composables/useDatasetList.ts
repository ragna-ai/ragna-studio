import { useQuery, type UseQueryOptions } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { datasetKeys } from '~/features/dataset/composables/useDatasetApi';
import type { DatasetManyResponse } from '~/features/dataset/types';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

type QueryOpts = Partial<UseQueryOptions<any>>;

export default function useDatasetList() {
  const api = useApi();
  // A workspace is always active (docs/api-standards/prd.md): activeWorkspaceId
  // is only briefly '' on first load, before the workspace list resolves it.
  const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());

  // useState -> single shared instance keyed by name, so pagination is owned
  // once instead of per-caller.
  const page = useState('dataset-list:page', () => 1);
  const limit = useState('dataset-list:limit', () => 10);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function useGetAllDatasets(options: QueryOpts = {}) {
    return useQuery<DatasetManyResponse>({
      queryKey: datasetKeys.list(activeWorkspaceId, page, limit),
      queryFn: ({ signal }) =>
        api(`/workspace/${toValue(activeWorkspaceId)}/dataset`, {
          method: 'GET',
          query: {
            page: page.value,
            limit: limit.value,
          },
          signal,
        }),
      enabled: () => !!toValue(activeWorkspaceId),
      placeholderData: (prev: DatasetManyResponse | undefined) => prev,
      ...options,
    });
  }

  return {
    page,
    limit,
    setPage,
    useGetAllDatasets,
  };
}
