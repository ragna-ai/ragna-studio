import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import { deriveThreadSummaryPatch, patchThreadDetail, patchThreadInLists } from '~/features/email/lib/email-thread-cache';
import type {
  EmailThreadActionResponse,
  EmailThreadDetailResponse,
  EmailThreadListFilters,
  EmailThreadListResponse,
} from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';

const THREADS_PAGE_SIZE = 25;

/**
 * [GET] /email/thread - paged by `page`/`limit` (validEmailThreadListQuery),
 * loaded as an infinite list: each successive page appends to `data.pages`
 * instead of replacing it, driving the thread list's "load more" affordance.
 * `filters` is `MaybeRefOrGetter` (task/agent composable convention, e.g.
 * useTaskApi.ts's `useGetTasks`) so callers can pass a plain `computed()`.
 * `enabled` lets EmailClient.vue skip this fetch entirely while the Drafts
 * pseudo-folder is active (its list comes from `useGetAllDrafts` instead).
 */
export function useGetEmailThreads(
  filters: MaybeRefOrGetter<EmailThreadListFilters>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const { $api } = useNuxtApp();

  return useInfiniteQuery({
    queryKey: emailKeys.threads(filters),
    queryFn: ({ pageParam, signal }) => {
      const resolved = toValue(filters);
      return $api<EmailThreadListResponse>('/email/thread', {
        method: 'GET',
        query: {
          page: pageParam,
          limit: THREADS_PAGE_SIZE,
          folder: resolved.folder ?? undefined,
          categoryId: resolved.categoryId ?? undefined,
          labelId: resolved.labelId ?? undefined,
        },
        signal,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length + 1 : undefined),
    enabled: () => toValue(enabled),
  });
}

/**
 * [GET] /email/thread/:threadId - a pure read (marking a thread read is a
 * separate explicit action, see useSetThreadRead below and its
 * EmailThreadView.vue caller), so this is always safe to refetch: no
 * suppression, no side effects to guard against.
 */
export function useGetEmailThread(threadId: MaybeRefOrGetter<string | null>) {
  const { $api } = useNuxtApp();
  return useQuery<EmailThreadDetailResponse>({
    queryKey: emailKeys.thread(threadId as MaybeRefOrGetter<string>),
    queryFn: ({ signal }) =>
      $api<EmailThreadDetailResponse>(`/email/thread/${toValue(threadId)}`, { method: 'GET', signal }),
    enabled: () => !!toValue(threadId),
  });
}

/**
 * Every thread action loops the thread's messages server-side and returns
 * their updated rows (email.controller.ts), which is enough to re-derive
 * and patch both the list row and the detail cache without a refetch. The
 * full derived summary (not just isUnread) is patched into the list so a
 * partial star/read change on a multi-message thread stays accurate there
 * too, not just in the open detail view.
 */
function applyThreadActionSuccess(
  queryClient: ReturnType<typeof useQueryClient>,
  threadId: string,
  messages: EmailThreadActionResponse['messages'],
  leavesCurrentFolder: boolean,
): void {
  patchThreadDetail(queryClient, threadId, messages);
  if (leavesCurrentFolder) {
    patchThreadInLists(queryClient, threadId, { remove: true });
  } else if (messages.length > 0) {
    patchThreadInLists(queryClient, threadId, deriveThreadSummaryPatch(messages));
  }
}

/** [POST] /email/thread/:threadId/archive */
export function useSetThreadArchived(filters: MaybeRefOrGetter<EmailThreadListFilters>) {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();

  return useMutation<EmailThreadActionResponse, unknown, { threadId: string; archived: boolean }>({
    mutationFn: ({ threadId, archived }) =>
      $api<EmailThreadActionResponse>(`/email/thread/${threadId}/archive`, { method: 'POST', body: { archived } }),
    onSuccess: ({ messages }, { threadId, archived }) => {
      applyThreadActionSuccess(queryClient, threadId, messages, archived && toValue(filters).folder === 'inbox');
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to archive thread')),
  });
}

/** [POST] /email/thread/:threadId/trash */
export function useSetThreadTrashed(filters: MaybeRefOrGetter<EmailThreadListFilters>) {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();

  return useMutation<EmailThreadActionResponse, unknown, { threadId: string }>({
    mutationFn: ({ threadId }) => $api<EmailThreadActionResponse>(`/email/thread/${threadId}/trash`, { method: 'POST' }),
    onSuccess: ({ messages }, { threadId }) => {
      applyThreadActionSuccess(queryClient, threadId, messages, toValue(filters).folder !== 'trashed');
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to move thread to trash')),
  });
}

/**
 * [POST] /email/thread/:threadId/star - "leaves the Starred folder" is
 * derived from the response's real per-message flags (a thread with other
 * still-starred messages must stay), not from the single message's
 * requested `starred` value.
 */
export function useSetThreadStarred(filters: MaybeRefOrGetter<EmailThreadListFilters>) {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();

  return useMutation<EmailThreadActionResponse, unknown, { threadId: string; starred: boolean }>({
    mutationFn: ({ threadId, starred }) =>
      $api<EmailThreadActionResponse>(`/email/thread/${threadId}/star`, { method: 'POST', body: { starred } }),
    onSuccess: ({ messages }, { threadId }) => {
      const stillStarred = messages.some((message) => message.isStarred);
      applyThreadActionSuccess(queryClient, threadId, messages, toValue(filters).folder === 'starred' && !stillStarred);
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to update star')),
  });
}

/** [POST] /email/thread/:threadId/read */
export function useSetThreadRead() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();

  return useMutation<EmailThreadActionResponse, unknown, { threadId: string; read: boolean }>({
    mutationFn: ({ threadId, read }) =>
      $api<EmailThreadActionResponse>(`/email/thread/${threadId}/read`, { method: 'POST', body: { read } }),
    onSuccess: ({ messages }, { threadId }) => {
      applyThreadActionSuccess(queryClient, threadId, messages, false);
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to update read status')),
  });
}
