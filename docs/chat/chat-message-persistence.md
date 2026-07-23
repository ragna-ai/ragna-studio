# Chat message persistence

How chat messages are stored, streamed, and rehydrated across the API and the web app.

## Storage format

Messages are stored 1:1 in the AI SDK `UIMessage` format. This is the format the client renders and sends. It round-trips losslessly: text, reasoning, tool calls, and files all live in `parts`.

Each message is one row in `chat_messages` (`packages/database/src/schema/chat.schema.ts`):

| Column     | Purpose                                                          |
| ---------- | ---------------------------------------------------------------- |
| `id`       | The `UIMessage` id. Client-generated for user messages, server-generated for assistant messages. |
| `chat_id`  | FK to `chats`.                                                    |
| `role`     | `system` / `user` / `assistant` as a real column, so it stays queryable. |
| `parts`    | The `UIMessage.parts` array as JSON, stored as-is.                |
| `metadata` | Optional `UIMessage.metadata` as JSON.                            |

One row per message, not one JSON blob per chat. This keeps appends cheap, allows upserts per message, and leaves room for per-message features like the planned `embedding` column.

## Write path (API)

Chat streaming lives on the WS `chat:<chatId>` channel (`apps/api/src/controllers/ws.controller.ts`, see `docs/team-chat/prd.md`), which calls `runChatStream` in `apps/api/src/services/chat.service.ts`:

1. The client sends only the newest `UIMessage`, not the full history. The server already fetched `userChat.messages` (the persisted history) for the channel-ownership check, so it rebuilds the full conversation as `[...userChat.messages, message]` and validates that combined array with `safeValidateUIMessages`. The DB, not the client, is authoritative for history; invalid payloads fail fast with a 400 before the stream opens.
2. The stream is built with `createUIMessageStream({ originalMessages, ... })`, passing the rebuilt array. Passing `originalMessages` puts the SDK into persistence mode: the assistant response gets a stable message id.
3. Persistence happens in the stream's `onEnd` callback. It receives the finished `responseMessage` as a `UIMessage`, so nothing has to be converted back from model messages.
4. `upsertChatMessages` (in `packages/database/src/repositories/chat.repo.ts`) upserts by message id. Retries and regenerations replace the existing row instead of duplicating it.
5. Persistence is skipped when the stream was aborted or finished with an error. Persistence failures are logged but do not break the response stream.

The new user message and the assistant response are saved together in one batch.

This means edit-and-regenerate-from-an-earlier-message isn't supported by the wire protocol today, only appending a new message onto the end of the persisted history — the UI has no affordance for it either.

## Read path (API)

`GET /chat/:chatId` returns messages strictly UIMessage-shaped: `{ id, role, parts, metadata? }`. DB-only fields (`createdAt`, null `metadata`) are stripped in the DTO. The client can feed the array into `useChat` without any mapping.

Ordering relies on `createdAt` (second precision) with SQLite rowid as the effective tie-break within a turn. If ordering within a turn ever becomes a problem, add a sequence column.

## Rehydration (web) and the vue-query readonly gotcha

`ChatConversation.vue` seeds `useChat` with the stored messages. The important detail:

**TanStack vue-query exposes cached `data` as a deep-readonly proxy.** The AI SDK `Chat` instance adopts the initial messages array as internal state and mutates it in place (`pushMessage`, `replaceMessage`). Handing it the cache array directly makes every write fail silently:

```
[Vue warn] Set operation on key "..." failed: target is readonly.
```

Symptom: streaming works in a fresh chat (initial messages are `undefined`) but produces no visible output after a reload of a chat with history.

The fix is a mutable copy at the ownership boundary:

```ts
const initialMessages = props.initialMessages
  ? structuredClone(toRaw(props.initialMessages))
  : undefined;
```

Why exactly this combination:

- A copy is mandatory, not optional. There are two owners of the state: the vue-query cache (server truth) and the `Chat` instance (live conversation). Without a copy, either writes fail (readonly) or `Chat` mutates the query cache behind vue-query's back.
- `structuredClone` alone throws `DataCloneError` on Vue proxies.
- `toRaw` alone returns the actual cache array, which `Chat` would then mutate in place.
- `toRaw` unwraps the proxy to plain JSON data (vue-query proxies are lazy wrappers over plain objects), then `structuredClone` makes a real deep copy.

This applies to any consumer that mutates vue-query data in place, not just chat.
