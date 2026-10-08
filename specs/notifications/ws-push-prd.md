# Notifications over WebSocket (PRD)

> **Status: proposed** (2026-07-23). Supersedes decision 4 ("Delivery by
> polling") in `notifications.md`. Builds on the WS foundation from
> `specs/team-chat/prd.md` (phase 1, merged via PR #5).

The web app polls `GET /notification/unread-count` every 30 seconds
(`useNotificationApi.ts`, `refetchInterval: 30_000`). Since then the app
gained an authenticated, channel-multiplexed WebSocket (`/ws`) for chat
streaming. Moving notification delivery onto it removes the polling
latency and the constant background requests.

The original notifications PRD deferred this because the emitter is the
worker process while the sockets live in the API, and bridging them needs
Redis pub/sub. That bridge is small, Redis is already a hard dependency,
and `publishFrame` in `channel.service.ts` was explicitly cut as the seam
for it. This PRD adds the bridge and the first non-chat channel type.

## Goals

- New WS channel type `notification:<userId>`; the client subscribes once
  while the app is open.
- The server pushes a signal frame when a notification row is created for
  that user. The client reacts by invalidating its existing vue-query
  caches and refetching over REST.
- A generic worker-to-API frame bridge over Redis pub/sub, reusable later
  for workflow-run progress.
- Polling drops from every 30 seconds to a slow safety-net interval.

## Non-goals

- Sending notification content over the socket. Rendering stays
  "present on read" via the REST list endpoint (see `notifications.md`).
- Multi-tab sync of read state (mark-read in one tab updating another).
  Cheap to add later by publishing from the API's mark-read handlers.
- Chat streaming over the Redis bridge. Chat fan-out stays per-process
  Bun pub/sub; only server-initiated notification frames cross Redis.
- Removing the REST endpoints. They stay the source of truth.

## Design decisions

1. **Signal, don't ship data.** The pushed frame carries no notification
   payload. The client invalidates `notificationKeys.unreadCount()` and
   `notificationKeys.list()` and refetches. Auth, pagination, and
   presentation stay in one place (the REST path), and there is no second
   serialization contract to keep in sync.
2. **Channel per user, not per notification.** `notification:<userId>`,
   subscribed once. The authorizer is `resourceId === user.id`: no DB
   lookup, unlike the `chat:` authorizer.
3. **Bridge messages are complete WS frames.** The worker publishes a
   ready-to-send `OutgoingWsFrame` JSON to a single Redis channel
   (`ws:frames`). The API's subscriber does not interpret it; it forwards
   the frame to the Bun topic named by `frame.channel`. Bun only delivers
   to sockets whose subscribe was authorized, so the bridge adds no new
   auth surface. Future producers (workflow progress) reuse the channel
   unchanged.
4. **Keep a slow polling fallback.** `refetchInterval` drops from 30s to
   5 minutes instead of being removed. The WS client reconnects and
   resubscribes on its own, but a missed frame during a reconnect window
   should not strand a stale badge until the next page load.
5. **Reuse the `chunk` frame type.** The protocol's server-to-client
   union already has `chunk` with an opaque payload. The bridge publishes
   `{ channel, type: 'chunk', payload: { event: 'created' } }`. No
   protocol change; the client treats any frame on the channel as the
   signal.

## Redis bridge

New file `packages/queue/src/services/ws-bridge.service.ts` (lives in
`@repo/queue` because that package already owns the shared Redis
connection config; both apps depend on it).

- `publishWsFrame(frame: { channel: string; type: string; payload?: unknown }): Promise<void>`
  publishes `JSON.stringify(frame)` to the `ws:frames` Redis channel.
  Used by the worker.
- `subscribeWsFrames(onFrame: (frame) => void): () => void` creates a
  dedicated subscriber connection (a subscribing ioredis connection
  cannot issue other commands, so it cannot share the BullMQ
  connection), parses each message, and hands valid frames to the
  callback. Returns a cleanup function. Used by the API.
- Malformed messages are logged and dropped, never thrown.
- Rebuild the package after editing (`pnpm --filter @repo/queue build`).

## Server changes (apps/api)

- `services/channel.service.ts`: add `notification` to
  `channelAuthorizers` with `async (resourceId, userId) => resourceId === userId`.
- `index.ts`: keep the `Bun.serve` return value and start the bridge:

  ```ts
  const server = Bun.serve({ ... });
  subscribeWsFrames((frame) => {
    server.publish(frame.channel, JSON.stringify(frame));
  });
  ```

  This is the server-initiated counterpart to `publishFrame` (which needs
  a socket); `server.publish` targets the topic directly.

- No `ws.controller.ts` changes. Subscribe/unsubscribe handling is
  already channel-generic; `message`/`abort` frames on a notification
  channel are already rejected or ignored.

## Worker changes (apps/worker)

- `processors/notification.processor.ts`: after `createNotification`,
  call `publishWsFrame({ channel: `notification:${userId}`, type: 'chunk', payload: { event: 'created' } })`.
  Best-effort: wrap in try/catch and log, a publish failure must never
  fail the job (the row is persisted; the fallback poll will pick it up).

## Web changes (apps/web)

- New `features/notification/composables/useNotificationSocket.ts`:
  subscribes to `notification:<userId>` via the existing
  `useWebSocketChannel()` (userId from the better-auth client session).
  On any frame, invalidate `notificationKeys.unreadCount()` and
  `notificationKeys.list()` through `useQueryClient`. Unsubscribe on
  scope dispose.
- Call it from `NavNotifications.vue`, which is always mounted in the
  top bar, so the subscription lives exactly as long as the bell.
- `useNotificationApi.ts`: change `refetchInterval` on
  `useGetUnreadNotificationCount` from `30_000` to `300_000`.
- No changes to list rendering, presenters, or mutations. The mutations
  already invalidate the same keys.

## Sequence

```
worker: notification.processor
  └─ createNotification (row persisted)
  └─ publishWsFrame → Redis channel ws:frames

api: index.ts subscriber
  └─ server.publish('notification:<userId>', frame)
       └─ delivered to every socket that subscribed (all the user's tabs)

web: useNotificationSocket
  └─ frame received → invalidate unread-count + list queries
       └─ vue-query refetches over REST → badge and dropdown update
fallback: unread-count still polls every 5 minutes
```

## Out of scope (later)

- Workflow-run progress frames through the same bridge.
- Read-state sync across tabs (publish from API mark-read handlers).
- Toast on arrival (vue-sonner). Trivial once the socket signal exists,
  but needs a payload contract, so it belongs with a deliberate decision
  to ship data over the socket.
