import { useQuery, type UseQueryOptions } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { datasetKeys } from '~/features/dataset/composables/useDatasetApi';
import type { DatasetManyResponse } from '~/features/dataset/types';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

type QueryOpts = Partial<UseQueryOptions<any>>;

export default function useDatasetList() {
  const api = useApi();
  const { listQuery, scopeKey, isAllItemsActive } = storeToRefs(useWorkspaceScopeStore());

  // useState -> single shared instance keyed by name, so pagination is owned
  // once instead of per-caller.
  const page = useState('dataset-list:page', () => 1);
  const limit = useState('dataset-list:limit', () => 10);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function useGetAllDatasets(options: QueryOpts = {}) {
    return useQuery<DatasetManyResponse>({
      queryKey: datasetKeys.list(page, limit, scopeKey),
      queryFn: ({ signal }) =>
        api('/dataset', {
          method: 'GET',
          query: {
            page: page.value,
            limit: limit.value,
            ...listQuery.value,
          },
          signal,
        }),
      placeholderData: (prev: DatasetManyResponse | undefined) => prev,
      ...options,
    });
  }

  return {
    page,
    limit,
    setPage,
    // The workspace column in the list table only shows in the "All items"
    // view (docs/datasets.md); a single workspace or Unassigned already
    // implies the workspace, so it would be redundant there.
    isAllItemsActive,
    useGetAllDatasets,
  };
}
