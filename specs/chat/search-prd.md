# Chat search (PRD)

> **Status: decided** (2026-09-08). Design agreed via discussion, not built
> yet.

Full-text search across a workspace's chats: matches chat titles and the
text content of chat messages. Surfaced as a dedicated search page, live
(debounced, as-you-type) rather than a manual submit.

## Goals (v1)

- Search a workspace's chats by title and by message content, scoped to
  `workspaceId` (same access model as the rest of chat — see
  `chat.service.ts`'s WP4 comment).
- Live search: results update as the user types, debounced, no submit
  button.
- Partial/substring matching (`raph` matches "Raphaela"), case-insensitive,
  language-agnostic — chat content is a mix of English and German (and
  possibly other languages) in the same message, so a stemmed/dictionary
  approach (Postgres `tsvector`) doesn't fit; a language-agnostic trigram
  approach does.
- Results page reuses the existing chat-history table layout (see
  `ChatManyTable.vue`): one row per matching chat. When the match is (also)
  in message content, the row additionally shows up to `snippetsPerChat`
  Google-style snippets — surrounding text with the match highlighted.
- Pagination on two independent axes: chats per results page, and snippets
  shown per chat row.
- Clicking a result opens the chat. Snippet data includes the matching
  message's id so a later "jump to and highlight that message" enhancement
  doesn't require backend changes.

## Non-goals (v1)

- No LLM/embedding-based (semantic) search. This is pure Postgres text
  matching — no model calls, no external services. (The `embedding` column
  commented out in `chat_messages` is unrelated pgvector scaffolding, not
  used here.)
- No typo-tolerant/fuzzy similarity scoring (e.g. "rpah" matching
  "raph"). Only substring containment, matching the behavior of the
  original ad-hoc query this PRD grew out of.
- No client-side search. Considered (a JS fuzzy-search lib like Fuse.js
  over an in-memory chat list) and rejected: viable for titles alone, but
  message content would require shipping every message's extracted text to
  the browser up front, an unbounded, ever-growing payload. Rejected in
  favor of one consistent server-side approach for both.
- No cross-workspace search.
- No jump-to-message-in-chat on click (see Goals — designed to be addable
  later without an API change, not built now).
- No duplicated/denormalized message content column. `chat_messages.parts`
  (jsonb) stays the source of truth; search queries extract text from it
  directly rather than maintaining a synced copy.

## Decisions

| Decision                                 | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Matching technique**                   | Postgres `pg_trgm` (trigram) extension: `ILIKE`/`%` substring matching, GIN-indexed. Not `tsvector` (stemming is language-specific and content is mixed-language), not an LLM/embedding approach (no model calls needed for literal substring search).                                                                                                                                                                                                                                  |
| **Title search**                         | Direct GIN trigram index on `chat.title` (`CREATE INDEX ... USING GIN (title gin_trgm_ops)`) — a plain existing column, indexing it is cheap and adds no new columns.                                                                                                                                                                                                                                                                                                                   |
| **Message content search**               | No new column. Query `chat_messages.parts` (jsonb) directly at search time, extracting `type = 'text'` parts and matching substrings via `ILIKE`. Scoped through a join on `chat.workspace_id` (already indexed via `chat_workspaceId_idx`) so the per-row jsonb unpacking only ever runs over one workspace's messages, not the whole table. Revisit (e.g. a functional trigram index, or a denormalized column) only if this proves too slow in practice — not designed for up front. |
| **UI trigger**                           | Live, debounced (~250ms after last keystroke), not a manual search button.                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Minimum query length**                 | 3 characters before a search fires. This isn't just UX — `pg_trgm` matches on 3-character trigrams, so 1–2 character queries have too few trigrams to use the index effectively and would be noisy/slow.                                                                                                                                                                                                                                                                                |
| **Result layout**                        | One row per matching chat, styled like the existing chat-history table (`ChatManyTable.vue`), not a combined flat list of chat-hits and message-hits, and not two separate sections.                                                                                                                                                                                                                                                                                                    |
| **Snippets per chat**                    | Up to `snippetsPerChat` (URL query param, default `3`) matching messages shown per chat row, each as a highlighted surrounding-text snippet. Ordering within a chat: most recent match first.                                                                                                                                                                                                                                                                                           |
| **Chats per page**                       | Standard `page`/`limit` pagination, same shape as the existing `paginationSchema` used by `GET /workspace/:workspaceId/chat` (default `limit` 20), applied to the list of _matching chats_ — independent of `snippetsPerChat`.                                                                                                                                                                                                                                                          |
| **Result ordering**                      | Most recently matching chat first (by the matched message's `createdAt`, or the chat's own `updatedAt` for title-only matches) — no relevance/similarity score, since matching is plain substring containment, not weighted fuzzy scoring.                                                                                                                                                                                                                                              |
| **Click behavior (v1)**                  | Opens the chat at its default (latest) position. No scroll-to-message yet.                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Click behavior (designed-for future)** | Each snippet in the API response carries the matching `chat_messages.id`. The frontend's chat-open navigation function accepts an optional `messageId` param now (unused in v1) so a later scroll-to/highlight feature is a frontend-only, no-API-change addition.                                                                                                                                                                                                                      |
| **Case sensitivity**                     | Toggleable via a `caseSensitive` query param (default `false`, i.e. `ILIKE`). When `true`, both title and message matching switch to `LIKE` instead. Same `gin_trgm_ops` index serves both — trigram indexes support `LIKE`/`ILIKE` equally, so no separate index or schema change. Surfaced in the UI as a switch next to the search input.                                                                                                                                            |

## Postgres extension: `pg_trgm`

Needs `CREATE EXTENSION IF NOT EXISTS pg_trgm;`, added alongside the
existing `CREATE EXTENSION IF NOT EXISTS vector;` in
`docker/postgres-init.sql`. `pg_trgm` is a standard Postgres contrib
module (same tier as `vector` on the `pgvector/pgvector` image already in
use) — no extra image/install needed.

**Important**: `docker-entrypoint-initdb.d` scripts (including
`postgres-init.sql`) only run once, on first container start against an
_empty_ data volume. Any environment with an existing `postgres_data`
volume (current local dev, staging, production) will **not** pick this up
automatically — the extension needs a one-time manual
`CREATE EXTENSION IF NOT EXISTS pg_trgm;` run against each existing
database as part of rollout, in addition to the docker-init file update
(which only helps fresh environments going forward).

## API

New endpoint: `GET /workspace/:workspaceId/chat/search`

Query params:

| Param             | Type    | Default | Notes                                                                        |
| ----------------- | ------- | ------- | ---------------------------------------------------------------------------- |
| `q`               | string  | —       | required, min length 3 (validated, matching the `pg_trgm` floor above)       |
| `page`            | number  | 1       | chats-per-page pagination                                                    |
| `limit`           | number  | 20      | chats-per-page pagination                                                    |
| `snippetsPerChat` | number  | 3       | matching messages shown per chat row                                         |
| `caseSensitive`   | boolean | `false` | `false` uses `ILIKE`, `true` uses `LIKE` for both title and message matching |

Response shape (draft):

```ts
interface ChatSearchResult {
  id: string;
  title: string;
  titleMatched: boolean;
  updatedAt: Date;
  agent: {
    id: string;
    name: string;
    aiModel: { id: string; provider: string; displayName: string };
  };
  messageSnippets: Array<{
    messageId: string;
    snippet: string; // surrounding text, match substring marked for highlighting
  }>;
}

interface ChatSearchResponse {
  results: ChatSearchResult[];
  totalCount: number; // count of distinct matching chats, for pagination
}
```

## Implementation notes

- **Title matches**: `SELECT ... FROM chat WHERE workspace_id = $1 AND title ILIKE '%' || $2 || '%'`, backed by the new trigram index.
- **Message matches**: join `chat_messages` to `chat` on `chat.workspace_id = $1`, unpack `parts` per row (`jsonb_array_elements`), filter to `type = 'text'` elements whose `text` field `ILIKE '%' || $2 || '%'`. Cap to `snippetsPerChat` per chat (e.g. `ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at DESC)` or a `LATERAL` join with `LIMIT`).
- **Combining**: union the set of chat ids from title matches and message matches into one distinct, paginated list of chats; then, for the page being returned, fetch up to `snippetsPerChat` message snippets per chat.
- **Snippet extraction**: once a matching text part is found, slice a fixed character window around the match position in application code (no `ts_headline` dependency, since that's a `tsvector`-only feature) and mark the matched substring for the frontend to highlight.
- Register any new index in the normal Drizzle schema flow (`packages/database/src/schema/chat.schema.ts`), pushed via `pnpm --filter @repo/database db:push` — no hand-written SQL migration needed for the index itself, only for the one-time extension creation described above.
