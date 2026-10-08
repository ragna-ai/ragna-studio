# Email Thread List: Mass (Bulk) Trash (change request)

> **Status: in-progress** (approved by Sven 2026-08-17; design fully
> clarified, no open points remain; implementation kicked off same day).
> Scoped to trash only; no other bulk action (archive, read/unread, star)
> is in scope for this change.

## Why

Every thread action today (`EmailThreadList.vue`,
`useEmailThreadApi.ts`, `email.controller.ts`,
`applyThreadAction`/`applyActionToMessages` in `email.service.ts`) operates
on exactly one thread per request, looping that thread's messages
server-side and issuing one Gmail API call per message. There is no
selection UI anywhere in the email feature (or the app - checked, no
existing bulk-select pattern to reuse) and no batch endpoint. Clearing out
a folder currently means clicking Trash once per thread, which doesn't
scale past a handful of threads.

## Decisions

| Question | Decision |
| --- | --- |
| Trash vs permanent delete | Trash only, via the existing per-message `provider.setTrashed` path. Reversible through the existing Trash-folder untrash action. No permanent-delete bulk action in this change. |
| Selection UX | Checkboxes per thread row + a "select all" control. Selection is page-scoped: "select all" selects every currently-*loaded* row (i.e. everything rendered so far via infinite scroll's "Load more", not just the first 25), not every thread matching the filter server-side. |
| Batch size cap | 50 threads per bulk-trash request. |
| Over-cap behavior | If the selection (via manual clicks or "select all" on a longer loaded list) exceeds 50, the bulk-trash button is disabled with an inline hint (e.g. "Select 50 or fewer to trash at once"). Selection itself is never silently trimmed. |
| Confirmation | Always show a confirm dialog before bulk-trashing, regardless of selection size. This differs from the single-thread trash button (which is instant/undoable) because bulk selection is a new, less-familiar action surface. |
| Execution model | Synchronous: one new bulk endpoint that loops the selected threads in the request handler, same tolerant-per-message error handling as today's `applyActionToMessages` (a failed message/thread is logged and left at its last-known state, not retried, doesn't fail the whole batch). No background job/queue - the 50-thread cap keeps worst-case Gmail call volume within a single request. |
| Toolbar placement | Contextual: `EmailThreadListFilterBar.vue`'s row is replaced by an action bar (selection count + Trash button + Cancel/clear) once >=1 thread is selected. Checkboxes on `EmailThreadListItem.vue` appear on row hover or whenever any selection is active (so the checkbox column doesn't persist and eat space when nothing is selected). |
| Other bulk actions | Out of scope for this change. The selection plumbing (checkbox state, action bar) should be built so archive/read/unread/star can reuse it later, but only trash ships now. |
| Selection state ownership | A dedicated composable (`useEmailThreadSelection.ts`), not page-local state in `EmailThreadList.vue`. `EmailClient.vue`/`EmailThreadList.vue` own the instance; it's passed down so `EmailThreadListItem.vue` (checkbox) and the action bar can read/mutate selection without prop-drilling through every level. |
| Selection lifecycle | Auto-clears on folder/filter change (route navigation), so a selection made in Inbox can never carry over and get applied against Trash or a different category. |
| Optimistic update on bulk success | Yes - mirrors `useSetThreadTrashed`'s single-thread pattern: each trashed thread in the bulk response is removed from the current list via `patchThreadInLists` (folder-dependent, same "leaves every view except Trash itself" rule), plus an `onSettled` invalidation of `['email', 'threads']` for consistency. Selection is cleared after a successful bulk-trash. |
| Bulk endpoint shape | `POST /email/thread/bulk/trash` with body `{ threadIds: string[] }`, validated by a new Zod schema mirroring `validTrashActionBody` (`email.schema.ts`) with `.min(1).max(50)` on the array. Response is `{ results: { threadId: string; ok: boolean }[] }`: one entry per requested id, `ok: false` for a thread that failed (not found, provider error, etc.) rather than aborting the whole batch - same tolerant, log-and-continue semantics as `applyActionToMessages`'s per-message handling today. |

## Delivery slices

One wave, two slices, no shared files (different apps) - both can be
built directly against the frozen contract above without waiting on each
other.

- **A — `apps/api`.** `validBulkTrashThreadsBody` in `email.schema.ts`
  (mirrors `validTrashActionBody`, adds the `threadIds` array with
  `.min(1).max(50)`). `bulkSetThreadsTrashedForUser` in `email.service.ts`:
  loops `threadIds`, calling the existing `setThreadTrashedForUser` per id
  wrapped in `tryCatch` so one bad/foreign/failing thread id doesn't reject
  the whole batch (mirrors `requireOwnedThread`'s `NotFoundException` per
  thread, and `applyActionToMessages`'s log-and-continue precedent),
  returning `{ threadId, ok }[]`. New route
  `POST /email/thread/bulk/trash` in `email.controller.ts`, same shape as
  the other `/thread/:threadId/...` action routes just above it. Extend
  `apps/api/test/email/actions.test.ts` for the new endpoint: full-batch
  success, partial failure (one bad id among valid ones), over-cap
  rejection (51 ids), empty array rejection.
- **B — `apps/web`.** New composable
  `features/email/composables/useEmailThreadSelection.ts` owning selected
  thread ids (`Set<string>` or similar), toggle/selectAll/clear, and a
  `count`/`isOverCap` (50) derived state; auto-clears on folder/filter
  change (watch the same `filters` the thread list already gets, e.g.
  `folder`/`categoryId`/`labelId`). New mutation `useBulkTrashThreads` in
  `useEmailThreadApi.ts`, same optimistic-removal shape as
  `useSetThreadTrashed` (`onMutate` removes every selected thread from the
  list via `patchThreadInLists`, since bulk-trashing always leaves every
  view except Trash itself - same rule as the single-thread `trashed: true`
  case; `onSettled` invalidates `['email', 'threads']`). `EmailThreadListItem.vue`
  gains a checkbox (visible on hover or whenever selection is active,
  per the "Toolbar placement" decision) wired to the selection composable,
  not a new prop threaded through every intermediate emit. `EmailThreadList.vue`
  swaps `EmailThreadListFilterBar` for an action bar (count, Trash button
  disabled when `isOverCap`, Cancel/clear) whenever selection is non-empty,
  and renders a confirm dialog (shadcn-vue `AlertDialog`, matching the
  app's existing confirm-dialog usage elsewhere) before firing
  `useBulkTrashThreads`. New types in `features/email/types/index.ts`:
  `EmailBulkTrashRequest { threadIds: string[] }`,
  `EmailBulkTrashResponse { results: { threadId: string; ok: boolean }[] }`.
