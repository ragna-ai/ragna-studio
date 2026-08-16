import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import {
  deriveThreadSummaryPatch,
  patchThreadDetail,
  patchThreadInLists,
} from '~/features/email/lib/email-thread-cache';
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
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
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
    queryKey: emailKeys.thread(threadId),
    queryFn: ({ signal }) =>
      $api<EmailThreadDetailResponse>(`/email/thread/${toValue(threadId)}`, {
        method: 'GET',
        signal,
      }),
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
    patchThreadInLists(
      queryClient,
      threadId,
      deriveThreadSummaryPatch(messages),
    );
  }
}

/**
 * [POST] /email/thread/:threadId/archive - optimistic removal + unconditional
 * onSettled invalidation, same shape as useDiscardEmailDraft
 * (useEmailDraftApi.ts): onMutate removes the row so it disappears
 * immediately, onSettled always re-syncs with the server regardless of
 * outcome (a failure un-does the optimistic removal via refetch, a success
 * just confirms it), so there's no snapshot to keep consistent by hand. This
 * also means a background sync's invalidation of the same query
 * (EmailClient.vue's lastSyncedAt watcher) can never get clobbered by a
 * stale rollback landing after it.
 */
export function useSetThreadArchived(
  filters: MaybeRefOrGetter<EmailThreadListFilters>,
) {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();

  return useMutation<
    EmailThreadActionResponse,
    unknown,
    { threadId: string; archived: boolean }
  >({
    mutationFn: ({ threadId, archived }) =>
      $api<EmailThreadActionResponse>(`/email/thread/${threadId}/archive`, {
        method: 'POST',
        body: { archived },
      }),
    // Archiving only leaves the current view when archiving *into* it from
    // the inbox. Unarchiving (`archived: false`) never removes a row, so
    // there's nothing to predict optimistically for it.
    onMutate: ({ threadId, archived }) => {
      if (archived && toValue(filters).folder === 'inbox') {
        patchThreadInLists(queryClient, threadId, { remove: true });
      }
    },
    onError: (error) =>
      toast.error(extractErrorMessage(error, 'Failed to archive thread')),
    onSettled: (_data, _error, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: ['email', 'threads'] });
      queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadId) });
    },
  });
}

/**
 * [POST] /email/thread/:threadId/trash - see useSetThreadArchived's doc
 * comment for the optimistic/onSettled shape. `trashed` is a two-way toggle
 * like `archived`: `true` trashes, `false` restores to the inbox.
 */
export function useSetThreadTrashed(
  filters: MaybeRefOrGetter<EmailThreadListFilters>,
) {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();

  return useMutation<
    EmailThreadActionResponse,
    unknown,
    { threadId: string; trashed: boolean }
  >({
    mutationFn: ({ threadId, trashed }) =>
      $api<EmailThreadActionResponse>(`/email/thread/${threadId}/trash`, {
        method: 'POST',
        body: { trashed },
      }),
    // Trashing leaves every view except Trash itself. Untrashing leaves the
    // Trash view (it's no longer trashed) but can't be optimistically added to
    // wherever it lands instead (inbox, a category, etc.) - onSettled's
    // invalidation picks that up on refetch.
    onMutate: ({ threadId, trashed }) => {
      const leavesCurrentView = trashed
        ? toValue(filters).folder !== 'trashed'
        : toValue(filters).folder === 'trashed';
      if (leavesCurrentView) {
        patchThreadInLists(queryClient, threadId, { remove: true });
      }
    },
    onError: (error, variables) =>
      toast.error(
        extractErrorMessage(
          error,
          variables.trashed
            ? 'Failed to move thread to trash'
            : 'Failed to restore thread from trash',
        ),
      ),
    onSettled: (_data, _error, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: ['email', 'threads'] });
      queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadId) });
    },
  });
}

/**
 * [POST] /email/thread/:threadId/star - "leaves the Starred folder" is
 * derived from the response's real per-message flags (a thread with other
 * still-starred messages must stay), not from the single message's
 * requested `starred` value.
 */
export function useSetThreadStarred(
  filters: MaybeRefOrGetter<EmailThreadListFilters>,
) {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();

  return useMutation<
    EmailThreadActionResponse,
    unknown,
    { threadId: string; starred: boolean }
  >({
    mutationFn: ({ threadId, starred }) =>
      $api<EmailThreadActionResponse>(`/email/thread/${threadId}/star`, {
        method: 'POST',
        body: { starred },
      }),
    onSuccess: ({ messages }, { threadId }) => {
      const stillStarred = messages.some((message) => message.isStarred);
      applyThreadActionSuccess(
        queryClient,
        threadId,
        messages,
        toValue(filters).folder === 'starred' && !stillStarred,
      );
    },
    onError: (error) =>
      toast.error(extractErrorMessage(error, 'Failed to update star')),
  });
}

/** [POST] /email/thread/:threadId/read */
export function useSetThreadRead() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();

  return useMutation<
    EmailThreadActionResponse,
    unknown,
    { threadId: string; read: boolean }
  >({
    mutationFn: ({ threadId, read }) =>
      $api<EmailThreadActionResponse>(`/email/thread/${threadId}/read`, {
        method: 'POST',
        body: { read },
      }),
    onSuccess: ({ messages }, { threadId }) => {
      applyThreadActionSuccess(queryClient, threadId, messages, false);
    },
    onError: (error) =>
      toast.error(extractErrorMessage(error, 'Failed to update read status')),
  });
}
