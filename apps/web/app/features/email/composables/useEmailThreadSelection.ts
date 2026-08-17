import type { EmailThreadListFilters } from '~/features/email/types';

/**
 * Batch size cap for `POST /email/thread/bulk/trash`
 * (apps/api/src/validation/email.schema.ts's `validBulkTrashThreadsBody`,
 * `.max(50)`). Exported so the action bar can disable the Trash button and
 * show the same number in its hint, instead of duplicating the cap.
 */
export const BULK_TRASH_MAX_SELECTION = 50;

export interface EmailThreadSelection {
  isSelected: (threadId: string) => boolean;
  toggle: (threadId: string) => void;
  selectAll: (threadIds: string[]) => void;
  clear: () => void;
  count: Readonly<Ref<number>>;
  isOverCap: Readonly<Ref<boolean>>;
  selectedIds: Readonly<Ref<string[]>>;
}

/**
 * Owns the set of checked thread ids for the mass-trash selection UI
 * (docs/email/mass-deletion-change-request.md). Pure UI-lifecycle state, no
 * query-client dependency: the bulk-trash mutation (useEmailThreadApi.ts's
 * `useBulkTrashThreads`) reads `selectedIds` and clears the selection itself
 * on success.
 *
 * Auto-clears whenever the thread list's active filters change - `filters`
 * is the same object EmailThreadList.vue already receives from
 * EmailClient.vue, so a selection made in one folder/category/label view can
 * never carry over and get bulk-trashed against a different one.
 */
export function useEmailThreadSelection(
  filters: MaybeRefOrGetter<EmailThreadListFilters>,
): EmailThreadSelection {
  const selected = reactive(new Set<string>());

  function isSelected(threadId: string): boolean {
    return selected.has(threadId);
  }

  function toggle(threadId: string): void {
    if (selected.has(threadId)) {
      selected.delete(threadId);
    } else {
      selected.add(threadId);
    }
  }

  function selectAll(threadIds: string[]): void {
    selected.clear();
    for (const threadId of threadIds) selected.add(threadId);
  }

  function clear(): void {
    selected.clear();
  }

  const count = computed(() => selected.size);
  const isOverCap = computed(() => count.value > BULK_TRASH_MAX_SELECTION);
  const selectedIds = computed(() => Array.from(selected));

  watch(() => toValue(filters), clear);

  return { isSelected, toggle, selectAll, clear, count, isOverCap, selectedIds };
}
