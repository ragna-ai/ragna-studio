import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type {
  TaskCommentManyResponse,
  TaskCommentResponse,
} from '~/features/task/types';
import { toErrorMessage } from '~/lib/api-error';
import { toast } from '~/lib/toast';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;
type TaskId = MaybeRefOrGetter<string>;

export const taskCommentKeys = {
  list: (workspaceId: WorkspaceId, taskId: TaskId) =>
    ['tasks', workspaceId, 'detail', taskId, 'comments'] as const,
};

function taskCommentsBasePath(workspaceId: WorkspaceId, taskId: TaskId) {
  return `/workspace/${toValue(workspaceId)}/task/${toValue(taskId)}/comments`;
}

export interface CreateTaskCommentVariables {
  body: string;
}

export interface UpdateTaskCommentVariables {
  commentId: string;
  body: string;
}

export function useGetTaskComments(taskId: TaskId) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<TaskCommentManyResponse>({
    queryKey: taskCommentKeys.list(workspaceId, taskId),
    queryFn: ({ signal }) =>
      $api<TaskCommentManyResponse>(taskCommentsBasePath(workspaceId, taskId), {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && !!toValue(taskId),
  });
}

export function useCreateTaskComment(taskId: TaskId) {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<TaskCommentResponse, unknown, CreateTaskCommentVariables>({
    mutationFn: (body) =>
      $api<TaskCommentResponse>(taskCommentsBasePath(workspaceId, taskId), {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskCommentKeys.list(workspaceId, taskId),
      });
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('task.comment.postFailed')));
    },
  });
}

export function useUpdateTaskComment(taskId: TaskId) {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<TaskCommentResponse, unknown, UpdateTaskCommentVariables>({
    mutationFn: ({ commentId, body }) =>
      $api<TaskCommentResponse>(
        `${taskCommentsBasePath(workspaceId, taskId)}/${commentId}`,
        {
          method: 'PATCH',
          body: { body },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskCommentKeys.list(workspaceId, taskId),
      });
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('task.comment.saveFailed')));
    },
  });
}

export function useDeleteTaskComment(taskId: TaskId) {
  const { $api } = useNuxtApp();
  const { t } = useI18n();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, string>({
    mutationFn: (commentId) =>
      $api(`${taskCommentsBasePath(workspaceId, taskId)}/${commentId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskCommentKeys.list(workspaceId, taskId),
      });
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, t('task.comment.deleteFailed')));
    },
  });
}
