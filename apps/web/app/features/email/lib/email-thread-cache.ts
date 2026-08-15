import type { InfiniteData, QueryClient } from '@tanstack/vue-query';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import type {
  EmailMessageActionRow,
  EmailMessageDetail,
  EmailThreadDetailResponse,
  EmailThreadListResponse,
  EmailThreadSummary,
} from '~/features/email/types';

// Shared cache-patching helpers for the thread list (infinite query, one
// cache entry per filter set) and thread detail queries, used by every
// mailbox action mutation (archive/trash/star/read at both the thread and
// message level) so a click updates every visible view of a thread without
// waiting on a refetch. Mirrors the task feature's onSuccess-patches-cache
// convention (useTaskApi.ts) rather than react-query's separate onMutate
// rollback machinery, since these actions' responses already carry the
// authoritative updated rows.

const THREADS_QUERY_PREFIX = ['email', 'threads'];

/**
 * Only the fields the aggregate actually reads, structurally satisfied by
 * both the full EmailMessageDetail (thread GET response) and the flags-only
 * EmailMessageActionRow (action responses / patchThreadDetail's merged
 * output) - deriveThreadSummaryPatch never needs `body`, so it shouldn't
 * require it.
 */
type ThreadSummarySource = Pick<EmailMessageDetail, 'labelIds' | 'isUnread' | 'isStarred' | 'categoryId'>;

/** Re-derives the list-row aggregate fields from a thread's current messages, same rule as apps/api's hydrateThreadSummary. */
export function deriveThreadSummaryPatch(
  messages: ThreadSummarySource[],
): Pick<EmailThreadSummary, 'labelIds' | 'isUnread' | 'isStarred' | 'categoryId' | 'messageCount'> {
  return {
    labelIds: Array.from(new Set(messages.flatMap((message) => message.labelIds))),
    isUnread: messages.some((message) => message.isUnread),
    isStarred: messages.some((message) => message.isStarred),
    categoryId: messages.findLast((message) => message.categoryId !== null)?.categoryId ?? null,
    messageCount: messages.length,
  };
}

/** Patches (or removes) a thread row across every cached list page, for every filter set currently in the cache. */
export function patchThreadInLists(
  queryClient: QueryClient,
  threadId: string,
  patch: Partial<EmailThreadSummary> | { remove: true },
): void {
  queryClient.setQueriesData<InfiniteData<EmailThreadListResponse>>(
    { queryKey: THREADS_QUERY_PREFIX },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          threads:
            'remove' in patch
              ? page.threads.filter((thread) => thread.id !== threadId)
              : page.threads.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread)),
        })),
      };
    },
  );
}

/**
 * Merges updated message rows into a thread's detail cache and re-derives
 * its summary. Returns the merged message list so callers (message-level
 * actions, which only get one updated row back from the API) can re-derive
 * an accurate list-row patch too, instead of guessing the thread's
 * aggregate flags from a single message - see patchThreadInLists callers
 * in useEmailMessageApi.ts.
 *
 * Merges field-by-field (`{ ...message, ...updated }`), not a wholesale
 * replace: `updatedMessages` rows are EmailMessageActionRow, which has no
 * `body` (see its doc comment in types/index.ts) - replacing the cached
 * EmailMessageDetail outright would silently drop `body` and crash the next
 * render that reads it (EmailMessageItem.vue). A field-wise spread leaves
 * the cached message's `body` untouched since `updated` has no `body` key
 * to overwrite it with.
 */
export function patchThreadDetail(
  queryClient: QueryClient,
  threadId: string,
  updatedMessages: EmailMessageActionRow[],
): EmailMessageDetail[] | null {
  let mergedMessages: EmailMessageDetail[] | null = null;

  queryClient.setQueryData<EmailThreadDetailResponse>(emailKeys.thread(threadId), (old) => {
    if (!old) return old;
    mergedMessages = old.messages.map((message) => {
      const updated = updatedMessages.find((candidate) => candidate.id === message.id);
      return updated ? { ...message, ...updated } : message;
    });
    return {
      thread: { ...old.thread, ...deriveThreadSummaryPatch(mergedMessages) },
      messages: mergedMessages,
    };
  });

  return mergedMessages;
}
