// file: socket.ts

import type { ServerWebSocket } from 'bun';
import type { BunWebSocketData } from '@hono/bun';
import { upgradeWebSocket, websocket } from '@hono/bun';

// Hono's Bun adapter always sets the runtime `WSContext.raw` value to the
// real Bun ServerWebSocket, but `@hono/bun`'s singleton `upgradeWebSocket` is
// typed `UpgradeWebSocket<any>`, so `WSContext.raw` comes through untyped.
// We want `raw.subscribe` / `raw.unsubscribe` / `raw.publish` for channel
// pub/sub, so callers assign `ws.raw` to this real (fuller) Bun type instead
// of Hono's narrower internal `BunServerWebSocket` (send/close/data/readyState only).
export type ChatServerWebSocket = ServerWebSocket<BunWebSocketData>;

// Re-exported from one place so the /ws controller (`upgradeWebSocket`) and
// index.ts (`websocket`, passed to Bun.serve) both wire the same underlying
// event bridge without importing `@hono/bun` directly everywhere.
export { upgradeWebSocket, websocket };
