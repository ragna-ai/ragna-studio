import { useQuery, type UseQueryOptions } from '@tanstack/vue-query';
import { workflowKeys } from '~/features/workflow/composables/useWorkflowApi';
import type { WorkflowManyResponse } from '~/features/workflow/types';
import { useActiveWorkspace } from '~/features/workspace/composables/useActiveWorkspace';

type QueryOpts = Partial<UseQueryOptions<any>>;

export default function useWorkflowList() {
  const api = useApi();
  const { scopeKey, listQuery } = useActiveWorkspace();

  // useState -> single shared instance keyed by name, so pagination is owned
  // once instead of per-caller.
  const page = useState('workflow-list:page', () => 1);
  const limit = useState('workflow-list:limit', () => 10);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function useGetAllWorkflows(options: QueryOpts = {}) {
    return useQuery<WorkflowManyResponse>({
      queryKey: workflowKeys.list(page, limit, scopeKey),
      queryFn: ({ signal }) =>
        api('/workflow', {
          method: 'GET',
          query: {
            page: page.value,
            limit: limit.value,
            ...listQuery.value,
          },
          signal,
        }),
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
