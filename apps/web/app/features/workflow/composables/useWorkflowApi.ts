import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { useActiveWorkspace } from '~/features/workspace/composables/useActiveWorkspace';
import type {
  UpsertWorkflowRequest,
  WorkflowManyResponse,
  WorkflowResponse,
  WorkflowRunManyResponse,
  WorkflowRunResponse,
} from '~/features/workflow/types';

export const workflowKeys = {
  all: ['workflows'] as const,
  list: (
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    scopeKey: MaybeRefOrGetter<string>,
  ) => ['workflows', 'list', page, limit, scopeKey] as const,
  detail: (workflowId: MaybeRefOrGetter<string>) =>
    ['workflows', 'detail', workflowId] as const,
  runs: (workflowId: MaybeRefOrGetter<string>) =>
    ['workflows', 'detail', workflowId, 'runs'] as const,
  run: (runId: MaybeRefOrGetter<string>) =>
    ['workflow-runs', 'detail', runId] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

/** Body ofetch attaches to a thrown error for a non-2xx JSON response. */
type FetchErrorWithData = { data?: unknown };

function hasErrorList(data: unknown): data is { errors: string[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'errors' in data &&
    Array.isArray((data as { errors: unknown }).errors)
  );
}

function hasErrorMessage(data: unknown): data is { error: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  );
}

/**
 * Turns a failed $fetch call into a user-facing message: prefers the
 * `errors: string[]` list `POST /workflow/:workflowId/publish` returns on a
 * validation failure, falls back to a plain `{ error: string }` body (e.g.
 * "not published" on `.../run`), then a generic fallback.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const data = (error as FetchErrorWithData | undefined)?.data;
  if (hasErrorList(data)) {
    return data.errors.join(', ');
  }
  if (hasErrorMessage(data)) {
    return data.error;
  }
  return fallback;
}

export function useGetWorkflow(
  workflowId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  return useQuery<WorkflowResponse>({
    queryKey: workflowKeys.detail(workflowId),
    queryFn: ({ signal }) =>
      api(`/workflow/${toValue(workflowId)}`, { method: 'GET', signal }),
    enabled: () => !!toValue(workflowId),
    ...options,
  });
}

export function useUpsertWorkflow() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { createWorkspaceId } = useActiveWorkspace();
  return useMutation<WorkflowResponse, unknown, UpsertWorkflowRequest>({
    mutationFn: (body) => {
      // Stamp the active workspace only when creating (no id yet) and a
      // specific workspace is active. Editing must not silently move a
      // workflow; All and Unassigned both mean "no workspace" and send
      // nothing (docs/workspaces.md).
      const workspaceId = body.id ? null : createWorkspaceId.value;
      return api('/workflow', {
        method: 'POST',
        body: workspaceId ? { ...body, workspaceId } : body,
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.all });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(response.workflow.id),
      });
      toast.success('Workflow saved');
    },
    onError: () => {
      toast.error('Failed to save workflow');
    },
  });
}

export function useDeleteWorkflow() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (workflowId) =>
      api(`/workflow/${workflowId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.all });
      toast.success('Workflow deleted');
    },
    onError: () => {
      toast.error('Failed to delete workflow');
    },
  });
}

export function usePublishWorkflow() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<WorkflowResponse, unknown, string>({
    mutationFn: (workflowId) =>
      api(`/workflow/${workflowId}/publish`, { method: 'POST' }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(response.workflow.id),
      });
      toast.success('Workflow published');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to publish workflow'));
    },
  });
}

export function useCreateWorkflowRun(workflowId: MaybeRefOrGetter<string>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<WorkflowRunResponse, unknown, string | undefined>({
    mutationFn: (input) =>
      api(`/workflow/${toValue(workflowId)}/run`, {
        method: 'POST',
        body: { input },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.runs(workflowId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to start run'));
    },
  });
}

export function useCancelWorkflowRun(runId: MaybeRefOrGetter<string>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<WorkflowRunResponse, unknown, void>({
    mutationFn: () => api(`/workflow/run/${toValue(runId)}/cancel`, { method: 'POST' }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.run(runId) });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.runs(response.run.workflowId),
      });
      toast.success('Run cancelled');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to cancel run'));
    },
  });
}

export function useGetWorkflowRuns(
  workflowId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  return useQuery<WorkflowRunManyResponse>({
    queryKey: workflowKeys.runs(workflowId),
    queryFn: ({ signal }) =>
      api(`/workflow/${toValue(workflowId)}/runs`, { method: 'GET', signal }),
    enabled: () => !!toValue(workflowId),
    ...options,
  });
}

export function useGetWorkflowRun(
  runId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  return useQuery<WorkflowRunResponse>({
    queryKey: workflowKeys.run(runId),
    queryFn: ({ signal }) =>
      api(`/workflow/run/${toValue(runId)}`, { method: 'GET', signal }),
    enabled: () => !!toValue(runId),
    ...options,
  });
}
