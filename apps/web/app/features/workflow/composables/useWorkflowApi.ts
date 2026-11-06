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
import { toErrorMessage } from '~/lib/api-error';

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

export function useGetWorkflow(
  workflowId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<WorkflowResponse>({
    queryKey: workflowKeys.detail(workspaceId, workflowId),
    queryFn: ({ signal }) =>
      $api<WorkflowResponse>(
        `/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(workflowId),
    ...options,
  });
}

export function useCreateWorkflow() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowResponse, unknown, CreateWorkflowRequest>({
    mutationFn: (body) =>
      $api<WorkflowResponse>(`/workspace/${toValue(workspaceId)}/workflow`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.all(workspaceId),
      });
      toast.success(t('workflow.toast.created'));
    },
    onError: () => {
      toast.error(t('workflow.toast.createFailed'));
    },
  });
}

interface UpdateWorkflowVariables extends UpdateWorkflowRequest {
  workflowId: string;
}

export function useUpdateWorkflow() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowResponse, unknown, UpdateWorkflowVariables>({
    mutationFn: ({ workflowId, ...body }) =>
      $api<WorkflowResponse>(
        `/workspace/${toValue(workspaceId)}/workflow/${workflowId}`,
        {
          method: 'PATCH',
          body,
        },
      ),
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.all(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(workspaceId, response.workflow.id),
      });
      toast.success(t('workflow.toast.saved'));
    },
    onError: () => {
      toast.error(t('workflow.toast.saveFailed'));
    },
  });
}

export function useDeleteWorkflow() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (workflowId) =>
      $api<void>(`/workspace/${toValue(workspaceId)}/workflow/${workflowId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.all(workspaceId),
      });
      toast.success(t('workflow.toast.deleted'));
    },
    onError: () => {
      toast.error(t('workflow.toast.deleteFailed'));
    },
  });
}

export function usePublishWorkflow() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowResponse, unknown, string>({
    mutationFn: (workflowId) =>
      $api<WorkflowResponse>(
        `/workspace/${toValue(workspaceId)}/workflow/${workflowId}/publish`,
        {
          method: 'POST',
        },
      ),
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(workspaceId, response.workflow.id),
      });
      toast.success(t('workflow.toast.published'));
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('workflow.toast.publishFailed')));
    },
  });
}

export function useCreateWorkflowRun(workflowId: MaybeRefOrGetter<string>) {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowRunResponse, unknown, string | undefined>({
    mutationFn: (input) =>
      $api<WorkflowRunResponse>(
        `/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}/run`,
        {
          method: 'POST',
          body: { input },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.runs(workspaceId, workflowId),
      });
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('workflow.toast.runStartFailed')));
    },
  });
}

export function useCancelWorkflowRun(
  workflowId: MaybeRefOrGetter<string>,
  runId: MaybeRefOrGetter<string>,
) {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<WorkflowRunResponse, unknown, void>({
    mutationFn: () =>
      $api<WorkflowRunResponse>(
        `/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}/run/${toValue(runId)}/cancel`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.run(workspaceId, workflowId, runId),
      });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.runs(workspaceId, workflowId),
      });
      toast.success(t('workflow.toast.runCancelled'));
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('workflow.toast.runCancelFailed')));
    },
  });
}

export function useGetWorkflowRuns(
  workflowId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<WorkflowRunManyResponse>({
    queryKey: workflowKeys.runs(workspaceId, workflowId),
    queryFn: ({ signal }) =>
      $api<WorkflowRunManyResponse>(
        `/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}/run`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(workflowId),
    ...options,
  });
}

export function useGetWorkflowRun(
  workflowId: MaybeRefOrGetter<string>,
  runId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<WorkflowRunResponse>({
    queryKey: workflowKeys.run(workspaceId, workflowId, runId),
    queryFn: ({ signal }) =>
      $api<WorkflowRunResponse>(
        `/workspace/${toValue(workspaceId)}/workflow/${toValue(workflowId)}/run/${toValue(runId)}`,
        { method: 'GET', signal },
      ),
    enabled: () =>
      !!toValue(workspaceId) && !!toValue(workflowId) && !!toValue(runId),
    ...options,
  });
}
