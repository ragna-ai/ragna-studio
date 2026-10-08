# Live Team Chat over WebSocket (PRD)

> **Status: implemented** (phase 1 only, merged via PR #5, 2026-07-19).
> The spec below was updated during the build, so it reflects what shipped,
> including a follow-up that moved the socket composable onto VueUse
> `useWebSocket` with an app-level ping/pong heartbeat (branch
> `feat/ws-vueuse`). The room engine (phase 2) is outlined at the end and
> gets its own PRD.

Teams exist today only as a workflow node: the lead runs a batch
`generateText` loop in the worker and the user sees a trace afterwards. The
end goal is a live team room where the user is a participant: they watch the
lead delegate, see members work, and can interject.

That requires a realtime push channel, which the app does not have (chat
streams over a single HTTP POST, notifications and workflow runs poll).
Strategy: build the WebSocket foundation first by migrating the existing
chat streaming endpoint onto it. Chat is a feature that already works, so
parity is verifiable, and roughly two thirds of the work (foundation,
composable, transport) is reused by the room engine later.

## Phases

1. **WS foundation + chat streaming migration** (this document).
2. **Room engine**: turn-based team conversation with user participation
   (outlined under "Phase 2", separate PRD later).

## Goals (phase 1)

- One authenticated WS endpoint `/ws` on the API, channel-multiplexed.
- Chat streaming moves from `POST /chat/:chatId` to WS. The HTTP streaming
  path is deleted in the same change (no dual-transport period).
- `useChat` and all message rendering stay untouched: a custom
  `ChatTransport` feeds the identical UIMessage chunk stream into it.
- Explicit abort ("stop generating") over WS.
- Multi-tab sync: every subscriber of a chat channel receives the broadcast.

## Non-goals (phase 1)

- The room engine itself. No new schema in phase 1.
- Resumable streams. `reconnectToStream` is stubbed; the server-side chunk
  buffer comes later.
- Multi-instance API scale-out. Bun pub/sub is per-process; a Redis bridge
  can slot in later. Publishing goes through one small function so only that
  function changes.
- Moving notifications or workflow-run polling to WS. Natural follow-ups,
  out of scope here.
- Push-disconnect on admin session revocation. Bounded by session expiry.

## Stack

Bun native WebSockets via Hono's `upgradeWebSocket` / `websocket` exports
from `hono/bun` (`createBunWebSocket()` is deprecated since hono 4.12 in
favor of these direct exports). No new dependencies.

- `apps/api/src/index.ts`: `Bun.serve({ port, fetch: app.fetch, websocket, idleTimeout: 0 })`.
- The upgrade is a normal GET through the Hono middleware chain, so
  `authMiddleware` guards the socket like every other route.
- Bun's topic pub/sub (`ws.subscribe(topic)` / `server.publish(topic, frame)`)
  implements channel fan-out; no hand-rolled subscriber bookkeeping.

Rejected alternatives: `ws` (Node-only), socket.io (redundant protocol and
client bundle next to the AI SDK transport), crossws (portability the API
does not need).

## Protocol

JSON envelope frames on a single socket:

```jsonc
{ "channel": "chat:<chatId>", "type": "<type>", "payload": {/* ... */} }
```

Channel names are `<resourceType>:<resourceId>`. Phase 1 ships `chat:`;
phase 2 adds `room:`.

| Direction       | Type          | Payload                                                                                                                             |
| --------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| client → server | `subscribe`   | none (channel in envelope)                                                                                                          |
| client → server | `unsubscribe` | none                                                                                                                                |
| client → server | `message`     | `{ message: UIMessage }` (only the newest message; the server rebuilds the rest of the conversation from its own persisted history) |
| client → server | `abort`       | none                                                                                                                                |
| server → client | `subscribed`  | none (ack)                                                                                                                          |
| server → client | `chunk`       | one UIMessage stream chunk, format unchanged                                                                                        |
| server → client | `done`        | none (stream complete; client closes its ReadableStream)                                                                            |
| server → client | `error`       | `{ code, message }` (maps the HTTP exceptions)                                                                                      |

Liveness: an app-level heartbeat, not WS-level ping/pong. Browser JS cannot
observe WS-level ping frames, so the client cannot detect a missed one that
way. Instead, the client's `useWebSocket` composable sends the raw string
`ping` every 30 seconds. The server replies with the raw string `pong`,
directly to that socket. `ping`/`pong` are plain text frames, deliberately
outside the `{ channel, type, payload }` envelope: they never go through
frame parsing or channel dispatch. Any incoming traffic counts as liveness
on the client side, not just a `pong`. If no message arrives within 10
seconds of a `ping`, the client treats the connection as dead, closes it,
and reconnects after a fixed 2-second delay (VueUse `autoReconnect`; the
earlier hand-rolled exponential backoff is gone).

## Auth model

Three layers: authenticate the connection, authorize each subscribe,
authorize each frame.

**Connection (upgrade).** Browsers attach cookies to the WS handshake, so
better-auth session validation via the existing `authMiddleware` works
unchanged. No session, no upgrade (401). The browser WebSocket API cannot
set headers, so cookie auth also avoids tokens in query strings. The upgrade
handler stashes `{ userId, sessionExpiresAt }` in the socket data.

**Origin allowlist (required).** CORS does not apply to WebSockets: any
site can open a socket and the browser attaches the session cookie
(cross-site WebSocket hijacking). The `/ws` route rejects upgrades whose
`Origin` header is not the web app origin (from config).

**Subscribe.** The server authorizes every subscribe against the database
and only the server calls `ws.subscribe`. A topic string from the client is
a request, never a grant. Authorization is a per-channel-type resolver map:

```ts
const channelAuthorizers = {
  chat: (id, userId) => getChatByIdForUser({ chatId: id, userId }).then(Boolean),
  // phase 2: room: (id, userId) => isRoomParticipant({ roomId: id, userId }),
};
```

Chat reuses the same ownership predicate as the REST routes, so WS cannot
become a side door with weaker rules. Granted channels are tracked in a
per-socket `Set`.

**Frames.** `message` / `abort` are accepted only for channels in the
socket's granted set (cheap set lookup; the DB check happened at subscribe).

**Session lifetime.** The socket is scheduled to close at
`sessionExpiresAt`; reconnect re-runs full cookie auth. Each new subscribe
re-validates the session. Admin revocation before expiry is accepted lag.

## Server changes (apps/api)

- `index.ts`: pass `websocket` to `Bun.serve`.
- New WS controller: `/ws` route (auth + origin check + upgrade), frame
  parsing/validation, dispatch to channel handlers.
- New channel service: authorizer map, per-socket granted set, publish
  helper (the single seam for a later Redis bridge).
- **Extract the chat streaming pipeline** from `chat.controller.ts` (the
  ~150-line `POST /:chatId` handler) into `chat.service.ts`, per the
  thin-controller rule. The service takes `{ chatId, userId, message }`
  (the single newest `UIMessage`) plus a chunk sink and keeps everything
  that exists today: message validation, `buildAgentInstructions`, title
  generation (including the transient `data-chat-title` part), `streamText`,
  persistence (the user message up front, the assistant response in
  `onEnd`; see `specs/chat/chat-message-persistence.md`). The WS chat
  handler calls it and publishes each chunk on `chat:<chatId>`.
  - `runChatStream` rebuilds the conversation server-side as
    `[...userChat.messages, message]` (the DB history it already fetched for
    the ownership check, plus the new message) before validating and
    converting to model messages. The client is no longer trusted to send
    the full history; the DB is authoritative. This also means
    edit-and-regenerate-from-an-earlier-message isn't supported by this
    protocol today, only appending a new message — matches the UI, which
    has no such affordance.
- In-flight run registry per chat holding the `AbortController`, so `abort`
  frames can find and cancel the run. HTTP request teardown no longer
  cancels for free.

## Web changes (apps/web)

- Socket composable: one connection per app, built on VueUse `useWebSocket`
  (subscribe/unsubscribe by channel, fixed-delay auto-reconnect, heartbeat,
  re-subscribe after reconnect, queue outgoing frames while disconnected).
- `WebSocketChatTransport` implementing the AI SDK `ChatTransport`. Note:
  the `chatId` argument `useChat` passes to `sendMessages` is the chat
  instance's internal id (a generated id when none is passed to `useChat`),
  not the app's chat id. The transport therefore takes a
  `getChatId: () => string | null` callback wired to the component's chat id
  ref, the same source the old `prepareSendMessagesRequest` used.
  - `sendMessages`: publish the `message` frame with only `messages.at(-1)`
    (the newest message `useChat` appended; the server rebuilds the rest of
    the history from its own DB), return a `ReadableStream` filled from
    incoming `chunk` frames until the finish chunk. Listens on the
    `abortSignal` that `useChat`'s stop button triggers and sends the
    `abort` frame, so the client-side stop UX needs no changes.
  - `reconnectToStream`: stubbed (returns no stream) until resumable
    streams land.
  - `error` frames become stream errors so `useChat` surfaces them as today.
- No changes to `ChatConversation.vue`, `ChatMessage.vue`, tool part
  rendering, or persistence-related client code.

## Phase 2 outline: the room engine

Recorded here so phase 1 seams are cut in the right places; details go in
its own PRD.

- Runs in the API process (interactive, needs the socket and the
  `AbortController`), not the worker. The worker keeps the batch team
  executor for workflow nodes.
- Shared code (member resolution, briefing builder, delegate tool factory,
  slug logic) moves out of `apps/worker/src/workflow/executors/team.executor.ts`
  into a shared package.
- Turn loop instead of one closed AI SDK call: a `room` has participants
  (user, lead, members); each agent turn is one bounded `streamText` call
  over the shared transcript, broadcast on `room:<roomId>`.
- Lead-mediated turn-taking: members speak only when invoked; user messages
  arriving mid-generation queue and are drained before the next turn. A hard
  cap bounds autonomous rounds per user message.
- Schema: `room`, `room_participant`, `room_message` with
  `authorParticipantId` and UIMessage-shaped `parts` jsonb (reuses message
  rendering). Register in `relations.ts`.
- Auth: one new entry in the authorizer map (participant lookup instead of
  ownership).

Open decisions for the phase 2 PRD: exact turn-taking rules, room
lifecycle (persistent like a chat is the leaning), autonomous round cap,
interrupt semantics (abort current turn vs queue-only).

## Later (explicitly deferred)

- Resumable streams (server-side chunk buffer + `reconnectToStream`).
- Redis pub/sub bridge for multi-instance API.
- Notifications and workflow-run progress over WS instead of polling.
- Push-disconnect on session revocation.
