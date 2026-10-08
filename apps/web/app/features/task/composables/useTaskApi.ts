import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  CreateTaskRequest,
  MoveTaskRequest,
  TaskDetailResponse,
  TaskListResponse,
  TaskPriority,
  TaskResponse,
  TaskStatus,
  UpdateTaskRequest,
} from '~/features/task/types';
import { extractErrorMessage } from '~/lib/api-error';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;
type QueryOpts = Partial<UseQueryOptions<any>>;

export interface TaskListFilterRefs {
  status?: MaybeRefOrGetter<TaskStatus | null | undefined>;
  priority?: MaybeRefOrGetter<TaskPriority | null | undefined>;
  taskLabelId?: MaybeRefOrGetter<string | null | undefined>;
}

export const taskKeys = {
  all: (workspaceId: WorkspaceId) => ['tasks', workspaceId] as const,
  list: (workspaceId: WorkspaceId, filters: TaskListFilterRefs) =>
    [
      'tasks',
      workspaceId,
      'list',
      filters.status,
      filters.priority,
      filters.taskLabelId,
    ] as const,
  detail: (workspaceId: WorkspaceId, taskId: MaybeRefOrGetter<string>) =>
    ['tasks', workspaceId, 'detail', taskId] as const,
  attachments: (workspaceId: WorkspaceId, taskId: MaybeRefOrGetter<string>) =>
    ['tasks', workspaceId, 'detail', taskId, 'attachments'] as const,
};

function taskBasePath(workspaceId: WorkspaceId): string {
  return `/workspace/${toValue(workspaceId)}/task`;
}

/**
 * Invalidates every list query variant (any filter combo) without also
 * matching a detail query, unlike `invalidateQueries({ queryKey:
 * taskKeys.all(...) })` (a 2-element key, `['tasks', workspaceId]`, which
 * partial-matches BOTH list and detail keys since they're both longer keys
 * sharing that prefix). A predicate is needed rather than a longer key
 * prefix because `taskKeys.list(workspaceId, {})` would bake in literal
 * `undefined`s for the filter slots, which only partial-matches a list
 * query whose filters are ALSO all `undefined` — not the filtered ones.
 */
function invalidateTaskLists(
  queryClient: QueryClient,
  workspaceId: WorkspaceId,
): Promise<void> {
  const resolvedWorkspaceId = toValue(workspaceId);
  return queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'tasks' &&
      query.queryKey[1] === resolvedWorkspaceId &&
      query.queryKey[2] === 'list',
  });
}

/**
 * Backs both the board and the list view (specs/tasks/prd.md, "Tasks page"):
 * one shared query per filter set, so switching views never refetches
 * differently. Not paginated: a board needs every card.
 */
export function useGetTasks(
  filters: TaskListFilterRefs = {},
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<TaskListResponse>({
    queryKey: taskKeys.list(workspaceId, filters),
    queryFn: ({ signal }) =>
      $api<TaskListResponse>(taskBasePath(workspaceId), {
        method: 'GET',
        query: {
          status: toValue(filters.status) || undefined,
          priority: toValue(filters.priority) || undefined,
          taskLabelId: toValue(filters.taskLabelId) || undefined,
        },
        signal,
      }),
    enabled: () => !!toValue(workspaceId),
    ...options,
  });
}

export function useGetTask(
  taskId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<TaskDetailResponse>({
    queryKey: taskKeys.detail(workspaceId, taskId),
    queryFn: ({ signal }) =>
      $api<TaskDetailResponse>(
        `${taskBasePath(workspaceId)}/${toValue(taskId)}`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(taskId),
    ...options,
  });
}

export function useCreateTask() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<TaskResponse, unknown, CreateTaskRequest>({
    mutationFn: (body) =>
      $api<TaskResponse>(taskBasePath(workspaceId), { method: 'POST', body }),
    onSuccess: (_response, { parentTaskId }) => {
      if (parentTaskId) {
        queryClient.invalidateQueries({
          queryKey: taskKeys.detail(workspaceId, parentTaskId),
        });
      }
      return invalidateTaskLists(queryClient, workspaceId);
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to create task'));
    },
  });
}

interface UpdateTaskVariables extends UpdateTaskRequest {
  taskId: string;
}

/**
 * Doubles as the description autosave mutation (document pattern): no
 * success toast here, that would fire on every debounced keystroke. Callers
 * representing a deliberate action pass their own `onSuccess` to `mutate()`.
 *
 * PATCH returns a bare `Task` row (no `labels`/`assignedAgent`/`subtasks`
 * join, unlike the document PATCH endpoint), so the detail cache is patched
 * directly with the response instead of refetched: invalidating both the
 * broad `taskKeys.all` and the specific detail key here used to fire two
 * overlapping refetches for the same query, and TanStack Query cancels the
 * first when the second lands (the "canceled request" + flicker). Only
 * `labelIds`/`assignedAgentId` changes actually need a fresh join (label
 * objects, agent name), so those are the only case that still triggers one
 * (not two) detail refetch.
 */
export function useUpdateTask() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<TaskResponse, unknown, UpdateTaskVariables>({
    mutationFn: ({ taskId, ...body }) =>
      $api<TaskResponse>(`${taskBasePath(workspaceId)}/${taskId}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (response, { taskId, labelIds, assignedAgentId }) => {
      queryClient.setQueryData<TaskDetailResponse>(
        taskKeys.detail(workspaceId, taskId),
        (previous) =>
          previous
            ? { task: { ...previous.task, ...response.task } }
            : previous,
      );

      const touchesJoinedFields =
        labelIds !== undefined || assignedAgentId !== undefined;
      if (touchesJoinedFields) {
        queryClient.invalidateQueries({
          queryKey: taskKeys.detail(workspaceId, taskId),
        });
      }

      // The board/list view renders labels, priority, due date, and
      // assignee inline too.
      return invalidateTaskLists(queryClient, workspaceId);
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to save task'));
    },
  });
}

interface MoveTaskVariables extends MoveTaskRequest {
  taskId: string;
}

/**
 * No optimistic patch for the *board*: it owns its own local column arrays
 * (vue-draggable-plus already moves the card visually before this fires)
 * and rolls them back itself via the per-call `onError` passed to
 * `mutate()`. This mutation persists the drop, patches the *detail* cache
 * directly from the response (see onSuccess), and reconciles list queries
 * on settle either way.
 */
export function useMoveTask() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<TaskResponse, unknown, MoveTaskVariables>({
    mutationFn: ({ taskId, ...body }) =>
      $api<TaskResponse>(`${taskBasePath(workspaceId)}/${taskId}/move`, {
        method: 'POST',
        body,
      }),
    onSuccess: (response, { taskId }) => {
      // Move only ever changes status/sortOrder, no joined data, so the
      // detail cache (if this task's own page happens to be open, e.g. it
      // was moved via its status select) is patched directly instead of
      // refetched, same reasoning as useUpdateTask above.
      queryClient.setQueryData<TaskDetailResponse>(
        taskKeys.detail(workspaceId, taskId),
        (previous) =>
          previous
            ? { task: { ...previous.task, ...response.task } }
            : previous,
      );
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to move task'));
    },
    onSettled: () =>
      // Board/list reconciliation after both success and error/rollback:
      // the board owns its own local column state for the optimistic drag,
      // this is the server-truth resync (specs/tasks/prd.md, "Board view").
      // Returned so the mutation stays pending until the refetch lands, not
      // just until the invalidation is queued (same fix as useMoveDatasetRow
      // in the dataset composable) — otherwise a fast second drag reads a
      // stale pre-move `props.tasks` array.
      invalidateTaskLists(queryClient, workspaceId),
  });
}

export function useDeleteTask() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (taskId) =>
      $api<void>(`${taskBasePath(workspaceId)}/${taskId}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await invalidateTaskLists(queryClient, workspaceId);
      toast.success('Task deleted');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to delete task'));
    },
  });
}

function taskAttachmentsBasePath(
  workspaceId: WorkspaceId,
  taskId: MaybeRefOrGetter<string>,
): string {
  return `${taskBasePath(workspaceId)}/${toValue(taskId)}/attachments`;
}

// One uploaded file, as returned by the task attachments endpoint. Same
// shape as ~/features/chat/composables/useChatApi.ts's ChatAttachment: `url`
// is a public CDN url for images and an authenticated API download path for
// documents.
export interface TaskAttachment {
  id: string;
  mediaId: string;
  filename: string;
  mediaType: string;
  size: number;
  url: string;
}

export interface GetTaskAttachmentsResponse {
  attachments: TaskAttachment[];
}

export function useGetTaskAttachments(
  taskId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<GetTaskAttachmentsResponse>({
    queryKey: taskKeys.attachments(workspaceId, taskId),
    queryFn: ({ signal }) =>
      $api<GetTaskAttachmentsResponse>(
        taskAttachmentsBasePath(workspaceId, taskId),
        { method: 'GET', signal },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(taskId),
    ...options,
  });
}

export interface UploadTaskAttachmentsResponse {
  attachments: TaskAttachment[];
}

export interface UploadTaskAttachmentsVariables {
  taskId: string;
  files: File[];
}

// Error handling is left to the caller
// (~/features/task/composables/useTaskAttachments.ts): it renders a
// per-item retry/dismiss state instead of a toast, so a generic `onError`
// here would double-report the same failure.
export function useUploadTaskAttachments() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<
    UploadTaskAttachmentsResponse,
    unknown,
    UploadTaskAttachmentsVariables
  >({
    mutationFn: ({ taskId, files }) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      return $api<UploadTaskAttachmentsResponse>(
        taskAttachmentsBasePath(workspaceId, taskId),
        { method: 'POST', body: formData },
      );
    },
    onSuccess: (_response, { taskId }) => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.attachments(workspaceId, taskId),
      });
    },
  });
}

export interface DeleteTaskAttachmentVariables {
  taskId: string;
  attachmentId: string;
}

// Also left to the caller to report, for the same reason as the upload
// mutation above.
export function useDeleteTaskAttachment() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, DeleteTaskAttachmentVariables>({
    mutationFn: ({ taskId, attachmentId }) =>
      $api<void>(
        `${taskAttachmentsBasePath(workspaceId, taskId)}/${attachmentId}`,
        { method: 'DELETE' },
      ),
    onSuccess: (_response, { taskId }) => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.attachments(workspaceId, taskId),
      });
    },
  });
}
