import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowResponse,
  WorkflowRunManyResponse,
  WorkflowRunResponse,
} from '~/features/workflow/types';

type WorkspaceId = MaybeRefOrGetter<string>;

export const workflowKeys = {
  all: (workspaceId: WorkspaceId) => ['workflows', workspaceId] as const,
  list: (
    workspaceId: WorkspaceId,
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    sort: MaybeRefOrGetter<string>,
  ) => ['workflows', workspaceId, 'list', page, limit, sort] as const,
  detail: (workspaceId: WorkspaceId, workflowId: MaybeRefOrGetter<string>) =>
    ['workflows', workspaceId, 'detail', workflowId] as const,
  runs: (workspaceId: WorkspaceId, workflowId: MaybeRefOrGetter<string>) =>
    ['workflows', workspaceId, 'detail', workflowId, 'runs'] as const,
  run: (
    workspaceId: WorkspaceId,
    workflowId: MaybeRefOrGetter<string>,
    runId: MaybeRefOrGetter<string>,
  ) => ['workflows', workspaceId, 'detail', workflowId, 'runs', runId] as const,
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
 * `errors: string[]` list `POST .../workflow/:workflowId/publish` returns on
 * a validation failure, falls back to a plain `{ error: string }` body (e.g.
 * "not published" on `.../run`), then a generic fallback.
 *
 * Also used by useNotificationApi.ts; keep this exported.
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
  const workspaceId = useActiveWorkspaceId();
  return useQuery<WorkflowResponse>({
    queryKey: workflowKeys.detail(workspaceId, workflowId),
    queryFn: ({ signal }) =>
      api(`/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && !!toValue(workflowId),
    ...options,
  });
}

export function useCreateWorkflow() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowResponse, unknown, CreateWorkflowRequest>({
    mutationFn: (body) =>
      api(`/workspace/${toValue(workspaceId)}/workflow`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.all(workspaceId) });
      toast.success('Workflow created');
    },
    onError: () => {
      toast.error('Failed to create workflow');
    },
  });
}

interface UpdateWorkflowVariables extends UpdateWorkflowRequest {
  workflowId: string;
}

export function useUpdateWorkflow() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowResponse, unknown, UpdateWorkflowVariables>({
    mutationFn: ({ workflowId, ...body }) =>
      api(`/workspace/${toValue(workspaceId)}/workflow/${workflowId}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.all(workspaceId) });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(workspaceId, response.workflow.id),
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
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (workflowId) =>
      api(`/workspace/${toValue(workspaceId)}/workflow/${workflowId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.all(workspaceId) });
      toast.success('Workflow deleted');
    },
    onError: () => {
      toast.error('Failed to delete workflow');
    },
  });
}

export function usePublishWorkflow() {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowResponse, unknown, string>({
    mutationFn: (workflowId) =>
      api(`/workspace/${toValue(workspaceId)}/workflow/${workflowId}/publish`, {
        method: 'POST',
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(workspaceId, response.workflow.id),
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
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowRunResponse, unknown, string | undefined>({
    mutationFn: (input) =>
      api(`/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}/run`, {
        method: 'POST',
        body: { input },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.runs(workspaceId, workflowId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to start run'));
    },
  });
}

export function useCancelWorkflowRun(
  workflowId: MaybeRefOrGetter<string>,
  runId: MaybeRefOrGetter<string>,
) {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowRunResponse, unknown, void>({
    mutationFn: () =>
      api(
        `/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}/run/${toValue(runId)}/cancel`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.run(workspaceId, workflowId, runId) });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.runs(workspaceId, workflowId),
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
  const workspaceId = useActiveWorkspaceId();
  return useQuery<WorkflowRunManyResponse>({
    queryKey: workflowKeys.runs(workspaceId, workflowId),
    queryFn: ({ signal }) =>
      api(`/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}/run`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && !!toValue(workflowId),
    ...options,
  });
}

export function useGetWorkflowRun(
  workflowId: MaybeRefOrGetter<string>,
  runId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<WorkflowRunResponse>({
    queryKey: workflowKeys.run(workspaceId, workflowId, runId),
    queryFn: ({ signal }) =>
      api(
        `/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}/run/${toValue(runId)}`,
        { method: 'GET', signal },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(workflowId) && !!toValue(runId),
    ...options,
  });
}
