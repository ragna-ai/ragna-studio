import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  invalidateTaskLists,
  taskKeys,
} from '~/features/task/composables/useTaskApi';
import {
  isTaskRunActive,
  taskRunPollInterval,
} from '~/features/task/lib/task-run-display';
import type {
  CancelAllTaskRunsResponse,
  TaskRunManyResponse,
  TaskRunResponse,
} from '~/features/task/types';
import { toErrorMessage } from '~/lib/api-error';
import { toast } from '~/lib/toast';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;
type TaskId = MaybeRefOrGetter<string>;

export const taskRunKeys = {
  list: (workspaceId: WorkspaceId, taskId: TaskId) =>
    ['tasks', workspaceId, 'detail', taskId, 'runs'] as const,
};

function workspacePath(workspaceId: WorkspaceId) {
  return `/workspace/${toValue(workspaceId)}`;
}

function taskRunsPath(workspaceId: WorkspaceId, taskId: TaskId) {
  return `${workspacePath(workspaceId)}/task/${toValue(taskId)}/runs`;
}

export interface StartTaskRunVariables {
  taskId: string;
  /** Assigns this agent to the task and starts it in one step. */
  agentId?: string;
}

export interface CancelTaskRunVariables {
  taskId: string;
  runId: string;
}

/** Polls every 5 s while the newest run is queued or running. */
export function useGetTaskRuns(taskId: TaskId) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<TaskRunManyResponse>({
    queryKey: taskRunKeys.list(workspaceId, taskId),
    queryFn: ({ signal }) =>
      $api<TaskRunManyResponse>(taskRunsPath(workspaceId, taskId), {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && !!toValue(taskId),
    refetchInterval: (query) =>
      taskRunPollInterval(
        query.state.data?.runs.some((run) => isTaskRunActive(run.status)) ??
          false,
      ),
  });
}

export function useStartTaskRun() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<TaskRunResponse, unknown, StartTaskRunVariables>({
    mutationFn: ({ taskId, agentId }) =>
      $api<TaskRunResponse>(taskRunsPath(workspaceId, taskId), {
        method: 'POST',
        body: agentId ? { agentId } : {},
      }),
    onSuccess: (_response, { taskId }) => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(workspaceId, taskId),
      });
      return invalidateTaskLists(queryClient, workspaceId);
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('task.run.startFailed')));
    },
  });
}

export function useCancelTaskRun() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<TaskRunResponse, unknown, CancelTaskRunVariables>({
    mutationFn: ({ taskId, runId }) =>
      $api<TaskRunResponse>(
        `${taskRunsPath(workspaceId, taskId)}/${runId}/cancel`,
        { method: 'POST' },
      ),
    onSuccess: (_response, { taskId }) => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(workspaceId, taskId),
      });
      return invalidateTaskLists(queryClient, workspaceId);
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('task.run.stopFailed')));
    },
  });
}

export function useCancelAllTaskRuns() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<CancelAllTaskRunsResponse, unknown, void>({
    mutationFn: () =>
      $api<CancelAllTaskRunsResponse>(
        `${workspacePath(workspaceId)}/task-runs/cancel-all`,
        { method: 'POST' },
      ),
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.all(workspaceId),
      });
      toast.success(
        t(
          'task.run.stopAllDone',
          { count: response.canceledCount },
          response.canceledCount,
        ),
      );
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('task.run.stopAllFailed')));
    },
  });
}
