# Batch per-item queries (N+1)

**Status: in-progress** (2026-10-08). Follows the "Database queries" rule in
`AGENTS.md` (PR #91).

## Problem

An audit on 2026-10-08 found four places that query the database once per
item of a list. Three are on request paths, so every page load pays for
them. The fourth is the per-message write pattern of the mail sync.

| Where                                                                                                                                      | Today                                           | Queries                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | --------------------------- |
| Inbox thread list, `email.service.ts` `hydrateThreadSummary`                                                                               | `listEmailMessagesByThreadId` per thread        | 1 + page size (25, max 100) |
| Dataset list, `dataset.repo.ts` `getDatasetsByWorkspaceId`                                                                                 | `getDatasetRowCount` per dataset                | 1 + page size               |
| Chat search, `chat.service.ts`                                                                                                             | `getChatSearchMessageSnippets` per matched chat | 1 + page size               |
| Mail message writes: worker `email-sync.service.ts` `importThread`, API `persistFetchedThread` and the body gap fill in `email.service.ts` | upsert message, then upsert body, per message   | 2 per message               |

`Promise.all` runs the per-item queries in parallel, but they are still N
round trips, and they compete for the `pg` pool (10 connections by default).
A 25-item page can briefly hold the whole pool and make other requests wait.

## Goals

- Each list above costs a fixed number of queries, independent of page size.
- Thread import writes all messages and all bodies of a thread in one
  statement each.
- No change to API responses or tool outputs.

## Non-goals

- Per-message provider API calls (Gmail, Graph). They are bounded by the
  provider, not by us.
- Flag updates (`updateEmailMessageFlags` per change) and message deletes in
  the incremental sync. Later candidates.
- The media sweep cron and bulk thread trash. Background or provider-bound.
- A query-counting test harness. The existing behavior tests guard the
  refactor; counting queries would be new test infrastructure.

## Design

### 1. Inbox thread list

`hydrateThreadSummary` already accepts `messages`. Add
`listEmailMessagesByThreadIds({ threadIds })` to `email-message.repo.ts`: one
`WHERE thread_id IN (...)` query, same ordering as
`listEmailMessagesByThreadId`. The list path loads messages for the whole page
once, groups them by `threadId` in memory, and passes each group to
`hydrateThreadSummary`. Message bodies live in their own table and are not
loaded.

Result: 2 queries per page instead of 1 + N.

### 2. Dataset list row counts

Add `getDatasetRowCounts({ datasetIds })` to `dataset.repo.ts`:

```sql
SELECT dataset_id, count(*) FROM dataset_rows
WHERE dataset_id IN (...) AND deleted_at IS NULL
GROUP BY dataset_id
```

It returns a `Map`. Datasets with no rows are absent from the result and
default to `0`, as today. `getDatasetRowCount` stays for single-dataset
callers.

Result: 2 queries per page.

### 3. Chat search snippets

Replace the per-chat `getChatSearchMessageSnippets` with one query for all
matched chats on the page. It keeps today's matching (same `DISTINCT ON`
message dedupe, same operator and pattern) and adds a window function to cap
snippets per chat:

```sql
ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at DESC) <= $snippetsPerChat
```

The service groups the rows by `chatId`. Remove the per-chat function if
nothing else uses it.

Result: 2 queries per search page instead of 1 + N.

### 4. Batched message writes

Two new repository functions next to their single-row versions:

- `upsertEmailMessagesByProviderMessageId(values[])`: one multi-row
  `INSERT ... ON CONFLICT (account_id, provider_message_id) DO UPDATE`, with
  every updated column set from `excluded`. Same columns as the single-row
  version.
- `upsertEmailMessageBodies(values[])`: one multi-row
  `INSERT ... ON CONFLICT (message_id) DO UPDATE`.

Rules both follow:

- **Dedupe before insert.** Postgres rejects an `ON CONFLICT DO UPDATE` that
  touches the same row twice in one statement. Dedupe by conflict key and keep
  the last occurrence.
- **Map results by key.** `RETURNING` order is not guaranteed to match input
  order. Callers map returned rows by `providerMessageId`.
- **Chunk.** Postgres allows 65,535 bind parameters per statement. Chunk at
  500 rows, far below the limit for the current column count.
- **Empty input** returns `[]` without a query.

Callers:

| Caller                                           | Change                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| worker `email-sync.service.ts` `importThread`    | All non-draft messages in one upsert, then all bodies in one upsert |
| API `email.service.ts` `persistFetchedThread`    | Same                                                                |
| API `email.service.ts` body gap fill (~line 838) | All missing bodies in one upsert                                    |

`importAddedMessage` in the incremental sync handles one message per change
and stays as it is.

**Error semantics change.** Today `persistFetchedThread` logs a failed message
and continues with the rest. A batched statement fails as a whole. This doc
accepts that: the realistic failure causes (connection loss, constraint or
schema errors) affect every row of the thread alike, and the next sync retries
the thread.

## Tests

Test-driven, per `AGENTS.md`. Each new repository function gets tests first:

- `listEmailMessagesByThreadIds`: grouping across several threads, ordering
  within a thread, empty input.
- `getDatasetRowCounts`: soft-deleted rows excluded, dataset with no rows
  absent, empty input.
- Chat search: snippet cap per chat across several chats, ordering, matched
  chats without snippet rows.
- Batched upserts: insert, update on conflict, duplicate keys in one batch,
  more rows than one chunk, empty input.

The existing endpoint tests (email thread list, dataset list, chat search,
email thread detail) must stay green unchanged. They are the guard that
responses don't change. Where an endpoint lacks a test for the shape this
touches, add one first.

The worker's `importThread` has no harness. It calls the same repository
functions, which are tested.

## Implementation slices

| Slice      | Scope            |
| ---------- | ---------------- |
| `nb-lists` | Sections 1, 2, 3 |
| `nb-mail`  | Section 4        |

Both can run in parallel. Shared file: `email.service.ts`. `nb-lists` owns the
thread-list path (`hydrateThreadSummary` callers in the list function);
`nb-mail` owns `persistFetchedThread` and the body gap fill.

## Decisions

1. A batched thread import fails as a whole instead of skipping a bad
   message. No row-by-row fallback (2026-10-08).
