import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { taskKeys } from '~/features/task/composables/useTaskApi';
import type {
  CreateTaskLabelRequest,
  TaskLabelManyResponse,
  TaskLabelResponse,
  UpdateTaskLabelRequest,
} from '~/features/task/types';
import { extractErrorMessage } from '~/lib/api-error';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;
type QueryOpts = Partial<UseQueryOptions<any>>;

export const taskLabelKeys = {
  all: (workspaceId: WorkspaceId) => ['taskLabels', workspaceId] as const,
  list: (workspaceId: WorkspaceId) =>
    ['taskLabels', workspaceId, 'list'] as const,
};

function taskLabelBasePath(workspaceId: WorkspaceId): string {
  return `/workspace/${toValue(workspaceId)}/task-label`;
}

export function useGetTaskLabels(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<TaskLabelManyResponse>({
    queryKey: taskLabelKeys.list(workspaceId),
    queryFn: ({ signal }) =>
      $api<TaskLabelManyResponse>(taskLabelBasePath(workspaceId), {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId),
    ...options,
  });
}

export function useCreateTaskLabel() {
  const { $api, $i18n } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<TaskLabelResponse, unknown, CreateTaskLabelRequest>({
    mutationFn: (body) =>
      $api<TaskLabelResponse>(taskLabelBasePath(workspaceId), {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskLabelKeys.all(workspaceId),
      });
      toast.success($i18n.t('task.toast.labelCreated'));
    },
    onError: (error) => {
      // Surfaces the API's duplicate-name 400.
      toast.error(
        extractErrorMessage(error, $i18n.t('task.toast.labelCreateFailed')),
      );
    },
  });
}

interface UpdateTaskLabelVariables extends UpdateTaskLabelRequest {
  taskLabelId: string;
}

export function useUpdateTaskLabel() {
  const { $api, $i18n } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<TaskLabelResponse, unknown, UpdateTaskLabelVariables>({
    mutationFn: ({ taskLabelId, ...body }) =>
      $api<TaskLabelResponse>(
        `${taskLabelBasePath(workspaceId)}/${taskLabelId}`,
        {
          method: 'PATCH',
          body,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskLabelKeys.all(workspaceId),
      });
      // Tasks embed their labels inline, so a rename/recolor needs to
      // refresh the board/list/detail caches too.
      queryClient.invalidateQueries({ queryKey: taskKeys.all(workspaceId) });
      toast.success($i18n.t('task.toast.labelUpdated'));
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, $i18n.t('task.toast.labelUpdateFailed')),
      );
    },
  });
}

/** Cascades the join rows only; never touches tasks. */
export function useDeleteTaskLabel() {
  const { $api, $i18n } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (taskLabelId) =>
      $api<void>(`${taskLabelBasePath(workspaceId)}/${taskLabelId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskLabelKeys.all(workspaceId),
      });
      queryClient.invalidateQueries({ queryKey: taskKeys.all(workspaceId) });
      toast.success($i18n.t('task.toast.labelDeleted'));
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, $i18n.t('task.toast.labelDeleteFailed')),
      );
    },
  });
}
