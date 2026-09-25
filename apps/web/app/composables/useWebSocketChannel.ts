import { useIntervalFn, useWebSocket } from '@vueuse/core';

export type WebSocketFrameType =
  | 'subscribe'
  | 'unsubscribe'
  | 'message'
  | 'abort'
  | 'subscribed'
  | 'chunk'
  | 'done'
  | 'error';

export interface WebSocketFrame<TPayload = unknown> {
  channel: string;
  type: WebSocketFrameType;
  payload?: TPayload;
}

type FrameListener = (frame: WebSocketFrame) => void;

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_PONG_TIMEOUT_MS = 10_000;
const RECONNECT_DELAY_MS = 2_000;

const channelListeners = new Map<string, Set<FrameListener>>();
const outgoingQueue: WebSocketFrame[] = [];

function isWebSocketFrame(value: unknown): value is WebSocketFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WebSocketFrame).channel === 'string' &&
    typeof (value as WebSocketFrame).type === 'string'
  );
}

function getWebSocketUrl(): string {
  const { public: publicConfig } = useRuntimeConfig();
  return `${publicConfig.apiBaseUrl.replace(/^http/, 'ws')}/ws`;
}

/** Re-sends a `subscribe` for every channel that still has listeners. */
function resubscribeAll() {
  for (const channel of channelListeners.keys()) {
    // useBuffer=false: our own outgoingQueue is the single source of truth
    // for frames sent while disconnected, not useWebSocket's internal one.
    wsSend(JSON.stringify({ channel, type: 'subscribe' }), false);
  }
}

function flushQueue() {
  while (outgoingQueue.length > 0) {
    const frame = outgoingQueue.shift();
    if (frame) wsSend(JSON.stringify(frame), false);
  }
}

function handleMessage(_ws: WebSocket, event: MessageEvent) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.data);
  } catch {
    // Malformed or non-JSON payload, ignore it silently. The heartbeat's
    // own `pong` reply never reaches here: useWebSocket recognizes it via
    // `responseMessage` below and swallows it before onMessage fires.
    return;
  }
  if (!isWebSocketFrame(parsed)) return;

  // Frames for a channel with no active listener are dropped silently.
  // Multi-tab chunk application is explicitly out of scope for phase 1.
  const listeners = channelListeners.get(parsed.channel);
  if (!listeners) return;
  for (const listener of listeners) listener(parsed);
}

// Module-level singleton: one socket for the whole app, shared across every
// caller of useWebSocketChannel(). `useWebSocket` is instantiated exactly
// once, right here at module scope, outside any component's effect scope —
// calling it inside a component would tie its `tryOnScopeDispose(close)` to
// that component and kill the app-wide socket on unmount.
//
// `immediate` and `autoConnect` are both off, so nothing here opens a
// connection yet. That matters because the URL getter below calls
// useRuntimeConfig(), which needs Nuxt's app context to resolve correctly;
// with `autoConnect` off, useWebSocket never eagerly reads the URL (it only
// would to set up its `watch(urlRef, open)`), so the getter isn't invoked
// until `connect()` calls `open()` on the first real `subscribe`/`send`,
// by which point the app has always finished bootstrapping.
const {
  status: socketStatus,
  send: wsSend,
  open: openSocket,
} = useWebSocket<string>(() => getWebSocketUrl(), {
  immediate: false,
  autoConnect: false,
  heartbeat: {
    message: 'ping',
    responseMessage: 'pong',
    scheduler: (cb) => useIntervalFn(cb, HEARTBEAT_INTERVAL_MS, { immediate: false }),
    pongTimeout: HEARTBEAT_PONG_TIMEOUT_MS,
  },
  autoReconnect: {
    retries: -1,
    delay: RECONNECT_DELAY_MS,
  },
  onConnected: () => {
    // Resubscribe frames must hit the wire before queued `message` frames,
    // or the server rejects the latter for lacking a granted channel.
    resubscribeAll();
    flushQueue();
  },
  onMessage: handleMessage,
});

function connect() {
  if (socketStatus.value === 'CLOSED') openSocket();
}

function sendOrQueue(frame: WebSocketFrame) {
  connect();
  if (socketStatus.value === 'OPEN') {
    wsSend(JSON.stringify(frame), false);
  } else {
    outgoingQueue.push(frame);
  }
}

/**
 * One shared WebSocket connection for the whole app, multiplexed by channel.
 *
 * Connects lazily on first `subscribe`/`send` call, reconnects with a fixed
 * delay (heartbeats detect dead connections so the server side stays
 * accurate), re-subscribes every channel that still has listeners after a
 * reconnect, and queues outgoing frames while disconnected.
 */
export function useWebSocketChannel() {
  /** Subscribes to a channel; returns an unsubscribe function. */
  function subscribe(channel: string, onFrame: FrameListener): () => void {
    connect();

    let listeners = channelListeners.get(channel);
    if (!listeners) {
      listeners = new Set();
      channelListeners.set(channel, listeners);
      // If we're not connected yet, onConnected()'s resubscribeAll() will
      // pick this channel up once the socket opens.
      if (socketStatus.value === 'OPEN') {
        wsSend(JSON.stringify({ channel, type: 'subscribe' }), false);
      }
    }
    listeners.add(onFrame);

    return () => {
      listeners.delete(onFrame);
      if (listeners.size === 0) {
        channelListeners.delete(channel);
        sendOrQueue({ channel, type: 'unsubscribe' });
      }
    };
  }

  function send(frame: WebSocketFrame) {
    sendOrQueue(frame);
  }

  return { subscribe, send };
}
