import { useQuery, type UseQueryOptions } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { workflowKeys } from '~/features/workflow/composables/useWorkflowApi';
import type { WorkflowManyResponse } from '~/features/workflow/types';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

type QueryOpts = Partial<UseQueryOptions<any>>;

export default function useWorkflowList() {
  const api = useApi();
  const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());

  // useState -> single shared instance keyed by name, so pagination is owned
  // once instead of per-caller.
  const page = useState('workflow-list:page', () => 1);
  const limit = useState('workflow-list:limit', () => 10);
  const sort = useState<'asc' | 'desc'>('workflow-list:sort', () => 'desc');

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function useGetAllWorkflows(options: QueryOpts = {}) {
    return useQuery<WorkflowManyResponse>({
      queryKey: workflowKeys.list(activeWorkspaceId, page, limit, sort),
      queryFn: ({ signal }) =>
        api(`/workspace/${activeWorkspaceId.value}/workflow`, {
          method: 'GET',
          query: {
            page: page.value,
            limit: limit.value,
            sort: sort.value,
          },
          signal,
        }),
      enabled: () => !!activeWorkspaceId.value,
      placeholderData: (prev: WorkflowManyResponse | undefined) => prev,
      ...options,
    });
  }

  return {
    page,
    limit,
    setPage,
    useGetAllWorkflows,
  };
}
