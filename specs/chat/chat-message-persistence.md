# Chat message persistence

How chat messages are stored, streamed, and rehydrated across the API and the web app.

## Storage format

Messages are stored 1:1 in the AI SDK `UIMessage` format. This is the format the client renders and sends. It round-trips losslessly: text, reasoning, tool calls, and files all live in `parts`.

Each message is one row in `chat_messages` (`packages/database/src/schema/chat.schema.ts`):

| Column     | Purpose                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `id`       | The `UIMessage` id. Client-generated for user messages, server-generated for assistant messages. |
| `chat_id`  | FK to `chats`.                                                                                   |
| `role`     | `system` / `user` / `assistant` as a real column, so it stays queryable.                         |
| `parts`    | The `UIMessage.parts` array as JSON, stored as-is.                                               |
| `metadata` | Optional `UIMessage.metadata` as JSON.                                                           |

One row per message, not one JSON blob per chat. This keeps appends cheap, allows upserts per message, and leaves room for per-message features like the planned `embedding` column.

## Write path (API)

Chat streaming lives on the WS `chat:<chatId>` channel (`apps/api/src/controllers/ws.controller.ts`, see `specs/team-chat/prd.md`), which calls `runChatStream` in `apps/api/src/services/chat.service.ts`:

1. The client sends only the newest `UIMessage`, not the full history. The server already fetched `userChat.messages` (the persisted history) for the channel-ownership check, so it rebuilds the full conversation as `[...userChat.messages, message]` and validates that combined array with `safeValidateUIMessages`. The DB, not the client, is authoritative for history; invalid payloads fail fast with a 400 before the stream opens.
2. The new user message is persisted right after validation, before the stream opens. `onEnd` skips persistence on abort/error (see below), so saving the user message only on success would silently drop it from the DB-rebuilt history while the client still shows it. A failed write here fails the whole turn before anything streams.
3. The stream is built with `createUIMessageStream({ originalMessages, ... })`, passing the rebuilt array. Passing `originalMessages` puts the SDK into persistence mode: the assistant response gets a stable message id.
4. The assistant response is persisted in the stream's `onEnd` callback. It receives the finished `responseMessage` as a `UIMessage`, so nothing has to be converted back from model messages.
5. `upsertChatMessages` (in `packages/database/src/repositories/chat.repo.ts`) upserts by message id. Retries and regenerations replace the existing row instead of duplicating it.
6. The assistant response is not persisted when the stream was aborted or finished with an error; the turn's user message already is (step 2), so it survives reloads and stays in the model's context on the next turn. Persistence failures in `onEnd` are logged but do not break the response stream.

### Why rebuilding history from the DB cannot race persistence

Since the client only sends the newest message, the server-side history must contain the previous turn before the next `message` frame is processed. That ordering is guaranteed:

1. The AI SDK awaits `onEnd` inside the final stream transform's `flush()` before the UI message stream closes (verified in `ai@7.0.29`, `handleUIMessageStreamFinish`). So the `for await` loop in `runChatStream` only finishes after the `upsertChatMessages` write has resolved.
2. The per-chat in-flight slot (`inFlightRunsByChatId`) is released in the `finally` after that loop, and a new `message` frame for the same chat is rejected with a conflict while the slot is held.

By the time the server accepts the next turn, `getChatByIdForUser` sees the previous turn's rows. If persistence is ever moved out of `onEnd` (for example into a fire-and-forget queue), this guarantee is lost and needs a replacement.

A turn that errors or is aborted therefore leaves a user message with no assistant reply, so history can contain consecutive `user` rows. Providers like Anthropic and Google reject non-alternating turns, so `runChatStream` collapses each run of consecutive user messages into one message (parts concatenated) before `convertToModelMessages`. Only the model-facing view is merged; the DB rows and the UI keep the messages separate, and existing histories with stacked user rows are healed without a migration.

This means edit-and-regenerate-from-an-earlier-message isn't supported by the wire protocol today, only appending a new message onto the end of the persisted history — the UI has no affordance for it either.

## Read path (API)

`GET /chat/:chatId` returns messages strictly UIMessage-shaped: `{ id, role, parts, metadata? }`. DB-only fields (`createdAt`, null `metadata`) are stripped in the DTO. The client can feed the array into `useChat` without any mapping.

Ordering relies on `createdAt` (second precision) with the time-ordered uuidv7 message id as tie-break for rows sharing a timestamp.

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
